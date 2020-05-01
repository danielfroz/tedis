import { createConnection, Socket } from "net";
import { connect, TLSSocket } from "tls";
import { v4 as uuidv4 } from "uuid";
// core
import { TedisParams } from './tedis'
import { Encoder } from "./encoder"
import { Parser } from './parser'

interface CommandParams {
	error:any
	data:any
	exception?:Error
	timedout?:boolean
}

interface Command {
	name: string
	callback: (params:CommandParams) => void
}

interface Result {
	data: any
	error: boolean
	exception?: Error
	timedout?: boolean
}

const sleep = (ms:number) => new Promise(resolve => setTimeout(resolve, ms))

export interface IBase {
	id: string;
	command(...parameters: Array<string | number>): Promise<any>;
	close(): void;
	on(event: "connect" | "timeout", listener: () => void): void;
	on(event: "error", listener: (err: Error) => void): void;
	on(event: "close", listener: (had_error: boolean) => void): void;
	on(event: string, listener: (...args: any[]) => void): void;
}

export class Base implements IBase {
	public id: string;
	private debug = false
	private socket: Socket | TLSSocket;
	private commands = new Array<Command>()
	private results = new Array<Result>()
	private handle_connect?: () => void;
	private handle_timeout?: () => void;
	private handle_error?: (err: Error) => void;
	private handle_close?: (had_error: boolean) => void;
	private encoder = new Encoder()
	private parser:Parser

	constructor(options: TedisParams = {}) {
		this.id = uuidv4();
		if (typeof options.tls !== "undefined") {
			this.socket = connect({
				host: options.host || "127.0.0.1",
				port: options.port || 6379,
				key: options.tls.key,
				cert: options.tls.cert,
			});
		} else {
			this.socket = createConnection({
				host: options.host || "127.0.0.1",
				port: options.port || 6379,
			});
		}
		if(options.debug) {
			this.debug = options.debug
		}

		this.init();

		const results = this.results
		this.parser = new Parser({
			debug: this.debug,
			handlers: {
				reply: (reply:any) => {
					const result = {
						data: reply
					} as Result
					results.push(result)
				},
				error: (error: any) => {
					const result = {
						error,
						data: error.message
					} as Result
					results.push(result)
				},
				timeout: () => {
					const result = {
						timedout: true,
						data: null
					} as Result
					results.push(result)
				},
				fatal: (error: any) => {
					const result = {
						error,
						data: null
					} as Result
					results.push(result)
				}
			}
		})

		if (typeof(options.timeout) === "number") {
			this.socket.setTimeout(options.timeout);
		}
		if (typeof(options.password) === "string") {
			this.auth(options.password);
		}
	}
	
	public command<T>(...parameters: Array<string | number>): Promise<T> {
		return new Promise((resolve, reject) => {
			this.commands.push({
				name: parameters[0] as string,
				callback: (params) => {
					if(params.exception) {
						return reject(params.exception)
					}
					if(params.error) {
						return reject(params.error)
					}
					if(params.timedout) {
						return reject('Command timedout')
					}
					return resolve(params.data)
				}
			});
			this.socket.write(this.encoder.encode(...parameters));
		});
	}

	public close() {
		this.socket.end();
	}

	public on(event: "connect" | "timeout", listener: () => void): void;
	public on(event: "close", listener: (had_error: boolean) => void): void;
	public on(event: "error", listener: (err: Error) => void): void;
	public on(event: string, listener: (...args: any[]) => void): void {
		switch (event) {
			case "connect":
				this.handle_connect = listener;
				break;
			case "timeout":
				this.handle_timeout = listener;
				break;
			case "error":
				this.handle_error = listener;
				break;
			case "close":
				this.handle_close = listener;
				break;
			default:
				throw new Error("event not found");
		}
	}
	private async auth(password: string) {
		try {
			return await this.command("AUTH", password);
		} catch (error) {
			this.socket.emit("error", error);
			this.socket.end();
		}
	}
	private init() {
		this.socket.on("connect", () => {
			if ("function" === typeof this.handle_connect) {
				this.handle_connect();
			}
		});
		this.socket.on("timeout", () => {
			if ("function" === typeof this.handle_timeout) {
				this.handle_timeout();
			} else {
				this.close();
			}
		});
		this.socket.on("error", err => {
			if ("function" === typeof this.handle_error) {
				this.handle_error(err);
			} else {
				console.error("error:", err);
			}
		});
		this.socket.on("close", (had_error: boolean) => {
			if (typeof(this.handle_close) === "function") {
				this.handle_close(had_error);
			}
		});
		this.socket.on("data", async (buffer:Buffer) => {
			if(this.debug) {
				console.log('Tedis: socket> data arrived: buffer: %o', buffer)
			}

			this.parser.parse(buffer);

			while(true) {
				const command = this.commands[0]
				const result = this.results[0]
				if(!command || !result) {
					// break
					await sleep(100)
					continue
				}

				command.callback({ 
					error: result.error,
					data: result.data, 
					exception: result.exception,
					timedout: result.timedout
				});

				this.commands.shift()
				this.results.shift()

				if(this.commands.length === 0 && this.results.length === 0) {
					// guarantee GC()...
					this.parser.clear()
					break
				}
			}

			if(this.debug) {
				console.log('Tedis: <socket')
			}
		});
	}
}
