import { createConnection, Socket } from "net";
import { connect, TLSSocket } from "tls";
// core
import { TedisConnectParams } from './tedis'
import { Encoder } from "./encoder"
import { Parser } from './parser'
import { TedisNetworkError, TedisError, TedisAuthError } from "./errors";

interface CommandCallbackParams {
	error:any
	data:any
	exception?:Error
	timedout?:boolean
}

interface Command {
	name: string
	callback: (params:CommandCallbackParams) => void
}

interface Result {
	data: any
	error: boolean
	exception?: Error
	timedout?: boolean
}

interface TedisHandlers {
	connect?: () => void
	message?: (message: any) => void
	error?: (err: Error) => void;
	timeout?: () => void
	close?: (error: boolean) => void
}

const sleep = (ms:number) => new Promise(resolve => setTimeout(resolve, ms))

export interface IBase {
	command(...parameters: Array<string | number>): Promise<any>;
	close(): void;
	on(event: "connect" | "timeout", listener: () => void): void;
	on(event: "error", listener: (err: Error) => void): void;
	on(event: "close", listener: (had_error: boolean) => void): void;
	on(event: string, listener: (...args: any[]) => void): void;
}

export class Base implements IBase {
	private debug = false
	private name?:string
	private socket?: Socket | TLSSocket
	private handlers?: TedisHandlers
	private commands = new Array<Command>()
	private results = new Array<Result>()
	private encoder = new Encoder()
	private parser:Parser

	constructor() {
		const results = this.results

		// Parser handlers are in fact command handlers.
		this.parser = new Parser({
			debug: false,
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
	}

	/**
	 * Example:
	 * 
	 * ```
	 * tedis.connect({ url: 'redis://anyuser:password@host' })
	 * ```
	 */
	public connect(params: TedisConnectParams): Promise<void> {
		return new Promise(async (resolve, reject) => {
			if(params.name) {
				this.name = params.name
			}

			// in case that URL is passed along
			// let's use it instead of individual host, port, password, etc...
			if(params.url) {
				const url = new URL(params.url)
				params.host = url.hostname
				params.port = url.port
				params.password = url.password
			}
			if(!params.port) {
				params.port = 6379
			}
	
			if(!params.host) {
				return reject(new TedisError('invalid params.host'))
			}
	
			if (params.tls) {
				this.socket = connect({
					host: params.host,
					port: typeof(params.port) === 'string'? parseInt(params.port): params.port,
					key: params.tls.key,
					cert: params.tls.cert,
				});
			} else {
				this.socket = createConnection({
					host: params.host,
					port: typeof(params.port) === 'string' ? parseInt(params.port): params.port,
				});
			}
	
			if(params.debug) {
				this.debug = params.debug
			}

			if (typeof(params.timeout) === "number") {
				this.socket.setTimeout(params.timeout);
			}
	
			this.socket.on("connect", () => {
				if(this.handlers && this.handlers.connect) {
					this.handlers.connect()
				}
			});
			this.socket.on("timeout", () => {
				if(this.handlers && this.handlers.timeout) {
					this.handlers.timeout()
				}
				else {
					this.close()
				}
			});
			this.socket.on("error", err => {
				if(this.handlers && this.handlers.error) {
					this.handlers.error(err)
				}
				else {
					console.error('tedis error uncaught: %o', err)
					throw err
				}
			});
			this.socket.on("close", (had_error: boolean) => {
				if(this.handlers && this.handlers.close) {
					this.handlers.close(had_error)
				}
				this.close()
			});
			this.socket.on("data", async (buffer:Buffer) => {
				if(this.debug) {
					console.log('Tedis:socket%s> data arrived: buffer: %o',
						this.name ? ':'+this.name: '', buffer)
				}
	
				this.parser.parse(buffer);

				while(true) {
					if(this.commands.length === 0 && this.results.length > 0) {
						// supporting pub sub...
						if(this.handlers && this.handlers.message) {
							// result.data returned... passing it through Tedis.message handler
							// likely error handler not needed in this case... maybe NetworkError
							const result = this.results[0]
							this.handlers.message(result.data)

							this.results.shift()
							
							if(this.results.length === 0) {
								this.parser.clear()
								break
							}
							else {
								continue
							}
						}
					}

					const command = this.commands[0]
					const result = this.results[0]
					if(!command || !result) {
						// try again after 100ms... prevent CPU clogging
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
	
					if(this.results.length === 0) {
						// ensures GC()...
						this.parser.clear()
						break
					}
				}
	
				if(this.debug) {
					console.log('Tedis:<socket%s', this.name ? ':'+this.name: '')
				}
			});

			// if password... then AUTH
			if(params.password) {
				try {
					await this.command("AUTH", params.password);
				}
				catch(error) {
					this.close()
					return reject(new TedisAuthError(error))
				}
			}

			// forces an error if not communicating correctly
			try {
				const pong = await this.command('PING')
				if(pong !== 'PONG') {
					throw new TedisNetworkError('invalid connection')
				}
			}
			catch(error) {
				this.close()
				return reject(error)
			}

			return resolve()
		})
	}

	public close() {
		if(this.socket) {
			this.socket.destroy()
		}
		this.socket = undefined
	}
	
	public command<T>(...parameters: Array<string | number>): Promise<T> {
		if(!this.socket) {
			throw new TedisNetworkError('not connected')
		}
		const socket = this.socket
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
			socket.write(this.encoder.encode(...parameters));
		});
	}

	public on(event: "connect" | "timeout", listener: () => void): void;
	public on(event: "message", listener: (message: any) => void): void
	public on(event: "close", listener: (had_error: boolean) => void): void;
	public on(event: "error", listener: (err: Error) => void): void;
	public on(event: string, listener: (...args: any[]) => void): void {
		switch (event) {
			case "connect":
				this.handlers = this.handlers ? {
					...this.handlers,
					connect: listener
				}: { connect: listener }
				break;
			case "message":
				this.handlers = this.handlers ? {
					...this.handlers,
					message: listener
				}: { message: listener }
				break;
			case "timeout":
				this.handlers = this.handlers ? {
					...this.handlers,
					timeout: listener
				}: { timeout: listener }
				break;
			case "error":
				this.handlers = this.handlers ? {
					...this.handlers,
					error: listener
				}: { error: listener }
				break;
			case "close":
				this.handlers = this.handlers ? {
					...this.handlers,
					close: listener
				}: { close: listener }
				break;
			default:
				throw new Error("invalid event");
		}
	}
}
