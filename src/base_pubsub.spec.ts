import { expect } from 'chai'
import { Tedis } from '.'

const sleep = (ms:number) => new Promise(resolve => setTimeout(resolve, ms))

describe('Base Pub Sub tests', function() {
	const channel = 'mychannel'

	it('subscribe unsubscribe basic test', async function() {
		const messages = new Array<any>()

		const sub = new Tedis()
		await sub.connect({ host: 'localhost', debug: false, name: 'sub' })
		sub.on('message', (message:any) => {
			messages.push(message)
		})

		const subReply = await sub.command('SUBSCRIBE', channel)
		expect(subReply).to.deep.equal([ 'subscribe', channel, 1 ])

		const pub = new Tedis()
		await pub.connect({ host: 'localhost', debug: false, name: 'pub' })
		await pub.command('PUBLISH', channel, 'Hello from the other side')
		await pub.command('PUBLISH', channel, 'Second message')
		pub.close()
		
		await sleep(100) // wait 100ms for async reply...

		const unsubReply = await sub.command('UNSUBSCRIBE', channel)
		expect(unsubReply).to.deep.equal([ 'unsubscribe', channel, 0 ])

		expect(messages).to.deep.equal([
			[ 'message', channel, 'Hello from the other side' ],
			[ 'message', channel, 'Second message' ]
		])
		sub.close()
	})

	it('publish with no subscriber listening', async function() {
		const pub = new Tedis()
		await pub.connect({ host: 'localhost', debug: false, name: 'pub' })
		const reply = await pub.command('PUBLISH', channel, 'does it work?')
		expect(reply).to.equal(0)
		pub.close()
	})

	it('psubscribe punsubscribe basic tests', async function() {
		const messages = new Array<any>()

		const sub = new Tedis()
		await sub.connect({ host: 'localhost', debug: false, name: 'sub' })
		sub.on('message', (message:any) => {
			messages.push(message)
		})

		const pattern = channel.substring(0, 3)+'*'
		const psubReply = await sub.command('PSUBSCRIBE', pattern)
		expect(psubReply).to.deep.equal([ 'psubscribe', pattern, 1 ])

		const pub = new Tedis()
		await pub.connect({ host: 'localhost', debug: false, name: 'pub' })
		await pub.command('PUBLISH', channel, 'Hello from the other side')
		await pub.command('PUBLISH', channel, 'Second message')
		pub.close()

		await sleep(100) // wait 100ms for async reply...

		const unsubReply = await sub.command('PUNSUBSCRIBE', pattern)
		expect(unsubReply).to.deep.equal([ 'punsubscribe', pattern, 0 ])
		sub.close()

		expect(messages).to.deep.equal([
			[ 'pmessage', pattern, channel, 'Hello from the other side' ],
			[ 'pmessage', pattern, channel, 'Second message' ]
		])
	})
})