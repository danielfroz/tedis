import assert from 'assert'

export class RedisError extends Error {
	get name() {
		return this.constructor.name
	}
}

export class ParserError extends RedisError {
	private _buffer:Buffer
	private _offset:number
	constructor(message: string, buffer: Buffer, offset: number) {
		assert(buffer)
		assert.strictEqual(typeof offset, 'number')

		const tmp = Error.stackTraceLimit
		Error.stackTraceLimit = 2
		super(message)
		Error.stackTraceLimit = tmp
		this._offset = offset
		this._buffer = buffer
	}
	get name() {
		return this.constructor.name
	}
	get buffer() {
		return this._buffer
	}
	get offset() {
		return this._offset
	}
}

export class ReplyError extends RedisError {
	constructor(message:string) {
		const tmp = Error.stackTraceLimit
		Error.stackTraceLimit = 2
		super(message)
		Error.stackTraceLimit = tmp
	}
	get name() {
		return this.constructor.name
	}
}

export class AbortError extends RedisError {
	get name() {
		return this.constructor.name
	}
}

export class InterruptError extends AbortError {
	get name() {
		return this.constructor.name
	}
}