import { expect } from 'chai'
import { Tedis } from './tedis'
import { after, before } from 'mocha'

describe('Tedis Streams tests', function () {
	const event = {
		id: '1',
		author: { id: '1', name: 'Super User' }
	}
	const stream = 'mystream'
	const consumerGroup = 'myservice'
	const consumerName = 'myprocess'
	let tedis:Tedis

	before(async function () {
		tedis = new Tedis()
		tedis.connect({ debug: false, host: 'localhost' })
	})
	
	after(async function () {
		await tedis.command('FLUSHALL')
		tedis.close();
	})

	it('xgroup create', async function () {
		const result = await tedis.command('xgroup', 'create', stream, consumerGroup, 0, 'MKSTREAM')
		expect(result).to.eq('OK')
	})

	it('xgroup create duplicated throwing error', async function () {
		try {
			await tedis.command('xgroup', 'create', stream, consumerGroup, 0, 'MKSTREAM')
		}
		catch(error) {
			expect(error).to.includes(/already exists/)
		}
	})

	it('xadd + xreadgroup', async function () {
		const xadd = await tedis.command('xadd', stream,
			'MAXLEN', '~', '1000',
			'*',
			'event', JSON.stringify(event))
		expect(xadd).to.be.a('string')
		const messageid = xadd
		const xread = await tedis.command('xreadgroup', 'group', consumerGroup, consumerName,
			'BLOCK', '200',
			'COUNT', 1,
			'STREAMS', stream, '>')
		const expectedResult = [
			[
				'mystream',
				[
					[
						messageid,
						[
							'event',
							'{"id":"1","author":{"id":"1","name":"Super User"}}'
						]
					]
				]
			]
		]
		expect(xread).to.deep.equal(expectedResult)
	})

	it('xreadgroup without message on queue; without block', async function() {
		// just to guarantee that will handle less than 1 sec...
		this.timeout(1 * 1000)
		try {
			await tedis.command('xreadgroup',
				'GROUP', consumerGroup, consumerName,
				'BLOCK', '1',
				'COUNT', '1',
				'STREAMS', stream, '>')
		}
		catch(error) {
			expect(error).to.equal('Command timedout')
		}
	})

	it('xgroup destroy', async function() {
		const result = await tedis.command('xgroup', 'destroy', stream, consumerGroup)
		expect(result).to.equal(1)
	})
})