import assert from 'assert'

export class TedisError extends Error {
	constructor(message:string|Error|any) {
		if(message) {	
			if(message instanceof Error) {
				super(message.message)
				this.stack = message.stack
			}
			else {
				if(typeof(message) === 'string') {
					super(message)
				}
				else {
					super(message.message || message.err)
				}
				Error.captureStackTrace(this, this.constructor)
			}
		}
		this.name = 'TedisError'
	}
}

/**
 * thrown during if Authentication fails
 */
export class TedisAuthError extends TedisError {
	constructor(message?:any) {
		super(message)
		this.name = 'TedisAuthError'
	}
}

export class TedisNetworkError extends TedisError {
	constructor(message?:any) {
		super(message)
		this.name = 'TedisNetworkError'
	}
}

export class TedisTimeoutError extends TedisNetworkError {
	constructor(message?:any) {
		super(message)
		this.name = 'TedisTimeoutError'
	}
}

export class TedisMessageError extends TedisError {
	constructor(message?:any) {
		super(message)
		this.name = 'TedisMessageError'
	}
}

export class TedisParserError extends TedisMessageError {
	private _buffer:Buffer
	private _offset:number

	constructor(message: any, buffer: Buffer, offset: number) {		
		super(message)
		assert(buffer)
		assert.strictEqual(typeof offset, 'number')
		this._offset = offset
		this._buffer = buffer
		this.name = 'TedisParserError'
	}

	get buffer() {
		return this._buffer
	}
	get offset() {
		return this._offset
	}
}

export class TedisReplyError extends TedisMessageError {
	constructor(message:string) {
		super(message)
		this.name = 'ReplyError'
	}
}