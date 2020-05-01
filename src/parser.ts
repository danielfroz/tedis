/**
 * This code came from https://github.com/NodeRedis/node-redis-parser
 * All credits to the authors
 * MIT license
 * Slightly modified by Daniel Froz <daniel.froz at actt.io>
 */
import * as errors from './errors'
import { StringDecoder } from 'string_decoder'

const CR = 13
const DOLLAR = 36
const ASTERISK = 42
const PLUS = 43
const MINUS = 45
const COLON = 58

type ReturnReplyHandler = (reply:string|Buffer|any[]) => void
type ReturnErrorHandler = (err:string|Buffer|Error) => void
type ReturnFatalErrorHandler = (err:string|Buffer|Error) => void
type ReturnTimeoutHandler = () => void

interface ParserParams {
	debug?: boolean
	returnBuffers?: boolean
	stringNumbers?: boolean
	handlers: {
		reply: ReturnReplyHandler,
		error: ReturnErrorHandler,
		timeout: ReturnTimeoutHandler,
		fatal?: ReturnFatalErrorHandler,
	}
}

export class Parser {
	private offset = 0
	private buffer?:Buffer
	private bufferPool = Buffer.allocUnsafe(8 * 1024)
	private bufferOffset = 0
	private bigStrSize?:number
	private totalChunkSize:number = 0
	private bufferCache:any = []
	private arrayCache:any = []
	private arrayPos:any = []
	private options = {
		debug: false,
		returnBuffers: false,
		stringNumbers: false
	}
	private handlers: {
		error:ReturnErrorHandler,
		reply:ReturnReplyHandler,
		timeout:ReturnTimeoutHandler,
		fatal?:ReturnFatalErrorHandler,
	}

	/**
	 * Javascript Redis Parser constructor
	 * @param {{returnError: Function, returnReply: Function, returnFatalError?: Function, returnBuffers: boolean, stringNumbers: boolean }} params
	 * @constructor
	 */
	constructor(params:ParserParams) {
		if (!params) {
			throw new TypeError('Params are mandatory.')
		}
		if(typeof(params.handlers.error) !== 'function') {
			throw new TypeError('error handler required')
		}
		if(typeof(params.handlers.reply) !== 'function') {
			throw new TypeError('reply handler required')
		}
		if(typeof(params.handlers.timeout) !== 'function') {
			throw new TypeError('timeout handler required')
		}
		this.handlers = {
			...params.handlers
		}
		if(params.returnBuffers) {
			this.options.returnBuffers = !!params.returnBuffers
		}
		if(params.stringNumbers) {
			this.options.stringNumbers = !!params.stringNumbers
		}
		if(params.debug) {
			this.options.debug = !!params.debug
		}
		this.clear()
	}

	/**
	 * Reset the parser values to the initial state
	 *
	 * @returns {void}
	 */
	clear(): void {
		if(this.options.debug) {
			console.log('Tedis: parser: clear()')
		}
		this.offset = 0
		this.buffer = undefined
		this.bufferPool = Buffer.allocUnsafe(8 * 1024)
		this.bufferOffset = 0
		this.bigStrSize = 0
		this.totalChunkSize = 0
		this.bufferCache = []
		this.arrayCache = []
		this.arrayPos = []
	}

	/**
	 * Parse the redis buffer... 
	 * Create object with response...
	 */
	parse(buffer:Buffer): void {
		if(this.options.debug) {
			console.log('Tedis: parser(buffer.length: %o)', buffer.length)
		}

		if (this.buffer == null) {
			this.buffer = buffer
			this.offset = 0
		}
		else if (this.bigStrSize === 0) {
			const oldLength = this.buffer!.length
			const remainingLength = oldLength - this.offset
			const newBuffer = Buffer.alloc(remainingLength + buffer.length)
			this.buffer!.copy(newBuffer, 0, this.offset, oldLength)
			buffer.copy(newBuffer, remainingLength, 0, buffer.length)
			this.buffer = newBuffer
			this.offset = 0
			if (this.arrayCache.length) {
				const arr = this._parseArrayChunks()
				if (arr == null) {
					return
				}
				this.handlers.reply(arr)
			}
		}
		else if (this.totalChunkSize + buffer.length >= this.bigStrSize!) {
			this.bufferCache.push(buffer)
			let tmp:any = this.options.returnBuffers ? this._concatBulkBuffer() : this._concatBulkString()
			this.bigStrSize = 0
			this.bufferCache = []
			this.buffer = buffer
			if (this.arrayCache.length) {
				this.arrayCache[0][this.arrayPos[0]++] = tmp
				tmp = this._parseArrayChunks()
				if (tmp == undefined) {
					return
				}
			}
			this.handlers.reply(tmp)
		}
		else {
			this.bufferCache.push(buffer)
			this.totalChunkSize += buffer.length
			return
		}

		while (this.offset < this.buffer.length) {
			const off = this.offset
			const type = this.buffer[this.offset++]
			const response = this._parseType(type)
			if (response == null) {
				if (!(this.arrayCache.length || this.bufferCache.length)) {
					this.offset = off
				}
				return
			}
			else if (type === MINUS) {
				this.handlers.error(response)
			}
			else {
				this.handlers.reply(response)
			}
		}
	}

	/**
	 * Called the appropriate parser for the specified type.
	 */
	private _parseType(type: number): any {
		// types evaluated in most used order...
		switch (type) {
			case PLUS:
				return this._parseSimpleString()
			case ASTERISK:
				return this._parseArray()
			case MINUS:
				return this._parseError()
			case DOLLAR:
				return this._parseBulkString()
			case COLON:
				return this._parseInteger()
			default:
				return this._handleError(type)
		}
	}

	/**
	 * Parsing error handler, resets parser buffer
	 */
	private _handleError(type: number): void {
		const buffer = this.buffer!
		const err = new errors.ParserError(
			'Protocol error, got ' + JSON.stringify(String.fromCharCode(type)) + ' as reply type byte',
			buffer, this.offset
		)
		this.buffer = undefined
		if(this.handlers.fatal) {
			this.handlers.fatal(err)
		}
		else {
			this.handlers.error(err)
		}
	}

	/**
	 * Used for integer numbers only
	 */
	private _parseSimpleNumbers(): number|undefined {
		const buffer = this.buffer!
		const length = buffer.length - 1
		var offset = this.offset
		var number = 0
		var sign = 1

		if (buffer[offset] === 45) {
			sign = -1
			offset++
		}

		while (offset < length) {
			const c1 = buffer[offset++]
			if (c1 === CR) { // \r\n
				this.offset = offset + 1
				return sign * number
			}
			number = (number * 10) + (c1 - 48)
		}

		return number
	}

	/**
	 * Used for integer numbers in case of the returnNumbers option
	 *
	 * Reading the string as parts of n SMI is more efficient than
	 * using a string directly.
	 */
	private _parseStringNumbers():string|number {
		const buffer = this.buffer!
		const length = buffer.length - 1
		var offset = this.offset
		var number = 0
		let res = ''

		if (buffer[offset] === MINUS) {
			res += '-'
			offset++
		}

		while (offset < length) {
			var c1 = buffer[offset++]
			if (c1 === CR) { // \r\n
				this.offset = offset + 1
				if (number !== 0) {
					res += number
				}
				break
			} else if (number > 429496728) {
				res += (number * 10) + (c1 - 48)
				number = 0
			} else if (c1 === 48 && number === 0) {
				res += 0
			} else {
				number = (number * 10) + (c1 - 48)
			}
		}
		return res
	}

	/**
	 * Parse a '+' redis simple string response but forward the offsets
	 * onto convertBufferRange to generate a string.
	 */
	private _parseSimpleString(): string|Buffer|undefined {
		const buffer = this.buffer
		if(!buffer) {
			throw new Error('buffer')
		}

		const start = this.offset
		const length = buffer.length - 1
		let offset = start

		while (offset < length) {
			if (buffer[offset] === CR) { // \r\n
				this.offset = offset + 2
				break;
			}
			offset++
		}

		if(offset === length) {
			return undefined
		}
		else {
			if(this.options.returnBuffers === true) {
				return buffer.slice(start, offset)
			}
			return buffer.toString('utf8', start, offset)
		}
	}

	/**
	 * Reads length:
	 * <number>\r\n
	 */
	private _parseLength(): number|undefined {
		const buffer = this.buffer!
		const length = buffer.length - 1
		let offset = this.offset
		let number = 0

		while (offset < length) {
			const c1 = buffer[offset++]
			if (c1 === CR) {
				this.offset = offset + 1
				return number
			}
			number = (number * 10) + (c1 - 48)
		}

		return undefined
	}

	/**
	 * Parse a ':' redis integer response
	 *
	 * If stringNumbers is activated the parser always returns numbers as string
	 * This is important for big numbers (number > Math.pow(2, 53)) as js numbers
	 * are 64bit floating point numbers with reduced precision
	 */
	private _parseInteger():number|string|undefined {
		if (this.options.stringNumbers === true) {
			return this._parseStringNumbers()
		}
		return this._parseSimpleNumbers()
	}

	/**
	 * Parse a '$' redis bulk string response
	 */
	private _parseBulkString() {
		const buffer = this.buffer
		if(!buffer){
			throw new Error('buffer')
		}
		const length = this._parseLength()
		if (length === undefined) {
			return;
		}
		if (length < 0) {
			return;
		}
		
		const off = this.offset + length
		if (off + 2 > buffer.length) {
			this.bigStrSize = off + 2
			this.totalChunkSize = buffer.length
			this.bufferCache.push(buffer)
			return
		}

		const start = this.offset
		this.offset = off + 2
		if (this.options.returnBuffers === true) {
			return buffer.slice(start, off)
		}

		return buffer.toString('utf8', start, off)
	}

	/**
	 * Parse a '-' redis error response
	 */
	private _parseError(): any {
		let string = this._parseSimpleString()
		if (string != null) {
			return new errors.ReplyError(string.toString())
		}
		else {
			return new errors.ReplyError('Unknown error returned by REDIS')
		}
	}

	/**
	 * Parse a '*' redis array response
	 * Also need to take care of TIMEOUTs: *-1\r\n
	 */
	private _parseArray(): Array<any>|null|undefined|void {
		if(!this.buffer) {
			throw new Error('buffer null')
		}
		const buffer = this.buffer
		let offset = this.offset

		// Checking for timeout: *-1\r\n
		if(buffer[offset++] === MINUS && (buffer[offset++]-48) === 1) {
			// timeout!
			this.offset = ++offset // escape LF
			if(this.handlers.timeout) {
				return this.handlers.timeout()
			}
			else {
				return this.handlers.reply([])
			}
		}
		
		const length = this._parseLength()
		if (length === undefined) {
			return null
		}
		if (length < 0) {
			return null
		}
		const responses = new Array(length)
		return this._parseArrayElements(responses, 0)
	}

	/**
	 * Push a partly parsed array to the stack
	 */
	private _pushArrayCache(array:any[], pos:number) {
		this.arrayCache.push(array)
		this.arrayPos.push(pos)
	}

	/**
	 * Parse chunked redis array response
	 */
	private _parseArrayChunks(): undefined|any[]|null {
		var arr = this.arrayCache.pop()
		var pos = this.arrayPos.pop()
		if (this.arrayCache.length) {
			const res = this._parseArrayChunks()
			if (res === undefined) {
				this._pushArrayCache(arr, pos)
				return
			}
			arr[pos++] = res
		}
		return this._parseArrayElements(arr, pos)
	}

	/**
	 * Parse redis array response elements
	 */
	private _parseArrayElements(responses:any[], i:number): any[]|null|undefined {
		const buffer = this.buffer
		if(!buffer) {
			throw new Error('buffer')
		}
		const bufferLength = buffer.length
		while (i < responses.length) {
			const offset = this.offset
			if (this.offset >= bufferLength) {
				this._pushArrayCache(responses, i)
				return
			}
			const response = this._parseType(buffer[this.offset++])
			if (response === undefined) {
				if (!(this.arrayCache.length || this.bufferCache.length)) {
					this.offset = offset
				}
				this._pushArrayCache(responses, i)
				return
			}
			responses[i] = response
			i++
		}

		return responses
	}

	/**
	 * Concat a bulk string containing multiple chunks
	 *
	 * Notes:
	 * 1) The first chunk might contain the whole bulk string including the \r
	 * 2) We are only safe to fully add up elements that are neither the first nor any of the last two elements
	 */
	private _concatBulkString(): string {
		const list = this.bufferCache
		const oldOffset = this.offset
		var chunks = list.length
		var offset = this.bigStrSize! - this.totalChunkSize
		this.offset = offset
		if (offset <= 2) {
			if (chunks === 2) {
				return list[0].toString('utf8', oldOffset, list[0].length + offset - 2)
			}
			chunks--
			offset = list[list.length - 2].length + offset
		}
		const decoder = new StringDecoder()
		var res = decoder.write(list[0].slice(oldOffset))
		for (var i = 1; i < chunks - 1; i++) {
			res += decoder.write(list[i])
		}
		res += decoder.end(list[i].slice(0, offset - 2))
		return res
	}

	/**
	 * Concat the collected chunks from parser.bufferCache.
	 *
	 * Increases the bufferPool size beforehand if necessary.
	 *
	 * @param {JavascriptRedisParser} parser
	 * @returns {Buffer}
	 */
	private _concatBulkBuffer(): Buffer {
		const list = this.bufferCache
		const oldOffset = this.offset
		const length = this.bigStrSize! - oldOffset - 2
		var chunks = list.length
		var offset = this.bigStrSize! - this.totalChunkSize
		this.offset = offset
		if (offset <= 2) {
			if (chunks === 2) {
				return list[0].slice(oldOffset, list[0].length + offset - 2)
			}
			chunks--
			offset = list[list.length - 2].length + offset
		}
		this._resizeBuffer(length)
		const start = this.bufferOffset
		list[0].copy(this.bufferPool, start, oldOffset, list[0].length)
		this.bufferOffset += list[0].length - oldOffset
		for (var i = 1; i < chunks - 1; i++) {
			list[i].copy(this.bufferPool, this.bufferOffset)
			this.bufferOffset += list[i].length
		}
		list[i].copy(this.bufferPool, this.bufferOffset, 0, offset - 2)
		this.bufferOffset += offset - 2
		return this.bufferPool.slice(start, this.bufferOffset)
	}

	/**
	 * Check if the requested size fits in the current bufferPool.
	 * If it does not, reset and increase the bufferPool accordingly.
	 *
	 * @param {number} length
	 * @returns {undefined}
	 */
	private _resizeBuffer(length:number): void {
		console.log('Tedis: parser: resizeBuffer()')
		if (this.bufferPool.length < length + this.bufferOffset) {
			const multiplier = length > 1024 * 1024 * 75 ? 2 : 3
			if (this.bufferOffset > 1024 * 1024 * 111) {
				this.bufferOffset = 1024 * 1024 * 50
			}
			this.bufferPool = Buffer.allocUnsafe(length * multiplier + this.bufferOffset)
			this.bufferOffset = 0
		}
	}
}