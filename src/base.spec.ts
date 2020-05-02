import net from 'net'
import { expect } from 'chai'
import { Tedis } from '.'

describe('Base tedis connection', function() {
	let tedis:Tedis

	before(function() {
		tedis = new Tedis()
	})

	it('connect url', async function() {
		await tedis.connect({ url: 'redis://localhost' })
		tedis.close()
	})

	it('connect url: host and port', async function() {
		await tedis.connect({ url: 'redis://localhost:6379' })
		tedis.close()
	})

	it('connect url: with password', async function(){
		try {
			await tedis.connect({ url: 'redis://any:realpassword@localhost:6379'})
		}
		catch(error) {
			expect(error.name).to.equal('TedisAuthError')
			expect(error.message).to.equal('ERR Client sent AUTH, but no password is set')
		}
		finally {
			tedis.close()
		}
	})

	it('connect host', async function() {
		await tedis.connect({ host: 'localhost' })
		tedis.close()
	})

	it('connect to invalid redis', async function() {
		// creating fake redis server for this test to guarantee Network failure
		const serverPort = 63799
		const server = net.createServer((client) => {
			client.write('damn!')
			client.on('close', () => {
				console.log('client disconnected!')
			})
		})
		try {
			server.listen(serverPort)
			await tedis.connect({ host: 'localhost', port: serverPort })
		}
		catch(error) {
			// console.log('error: %o', error)
			expect(error.name).to.equal('TedisParserError')
			expect(error.message).to.includes('Protocol error')
		}
		finally {
			tedis.close()
			server.close()
		}
	})
})