import { expect } from 'chai'
import * as e from '.'

describe('errors tests', function() {
	it('TedisError', function() {
		const error = new e.TedisError('This is an example of error')
		expect(error.name).to.equal('TedisError')
		expect(error.message).to.equal('This is an example of error')
	})

	it('TedisAuthError', function() {
		const error = new e.TedisAuthError('Password rejected')
		expect(error.name).to.equal('TedisAuthError')
		expect(error.message).to.equal('Password rejected')
	})
})