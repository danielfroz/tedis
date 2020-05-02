import { expect } from 'chai'
import { Tedis } from './tedis'
import { after, before } from 'mocha'

describe('Tedis command tests', function () {
	const tedis = new Tedis()

	before(async function () {
		tedis.connect({ host: 'localhost' })
	})
	
	after(async function () {
		await tedis.command("FLUSHALL");
		tedis.close();
	})

	it('set get del', async function () {
		const result = await tedis.command('SET', 'testKEY', 'valueVALUE')
		expect(result).to.equal('OK')
		const value = await tedis.command('GET', 'testKEY')
		expect(value).to.equal('valueVALUE')
		const removed = await tedis.command('DEL', 'testKEY')
		expect(removed).to.equal(1)
	})

	it('set testKEY with huge value', async function () {
		let hugeValue = ''
		for(let i=0; i < 1000; i++) {
			hugeValue += 'this is a huge value; '
		}
		const result = await tedis.command('SET', 'testKEY', hugeValue)
		expect(result).to.eq('OK')
		const value = await tedis.command('GET', 'testKEY')
		expect(value).to.eq(hugeValue)
	})
})