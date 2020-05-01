import chai from 'chai'
import { Parser } from "./parser";

chai.config.showDiff = true
const expect = chai.expect

describe("Parser test case", function () {
	const results = new Array<any>()
	const parser:Parser = new Parser({
		debug: false,
		handlers: {
			reply: (reply:any) => {
				results.push({
					error: false,
					data: reply
				})
			},
			error: (error: any) => {
				results.push({
					error: true,
					data: error.message
				})
			},
			timeout: () => {
				results.push({
					data: undefined,
					error: false,
					timedout: true,
				})
			},
			fatal: (error: any) => {
				results.push({
					error: true,
					data: error
				})
			}
		}
	})

	afterEach(function() {
		parser.clear()
		results.splice(0, results.length)
	})

	it(`+OK`, function () {
		parser.parse(Buffer.from(`+OK\r\n`));
		expect(results).to.deep.equal([
			{ data: 'OK', error: false }
		]);
	})

	it('+Piped String Responses', function () {
		const buffer = Buffer.from(`+Piped Responses 1\r\n+Piped Responses 2\r\n+Piped Responses 3\r\n`)
		parser.parse(buffer)
		expect(results).to.deep.equal([
			{ data: 'Piped Responses 1', error: false },
			{ data: 'Piped Responses 2', error: false },
			{ data: 'Piped Responses 3', error: false }
		])
	})

	it('+ parsing two buffer data', function() {
		const buffer1 = Buffer.from('+This is a weird response')
		const buffer2 = Buffer.from(' coz it takes completed in two reads\r\n')
		parser.parse(buffer1)
		expect(results).to.length(0)
		parser.parse(buffer2)
		expect(results).to.length(1)
		expect(results).to.deep.equal([
			{
				data: 'This is a weird response coz it takes completed in two reads',
				error: false
			}
		])
	})

	it(`-Error type`, function () {
		parser.parse(Buffer.from(`-Error type\r\n`));
		expect(results).to.deep.equal([
			{ data: "Error type", error: true }
		]);
	})

	it(`$ bulk string`, function () {
		parser.parse(Buffer.from(`$12\r\nhello world!\r\n`));
		expect(results).to.deep.equal([
			{ error: false, data: "hello world!" }
		]);
	})

	it('$ bulk binary string', function () {
		let binary = 'This is a string with invalid data...\r\n so bulk is needed'
		parser.parse(Buffer.from('$'+binary.length+'\r\n'+binary+'\r\n'))
		expect(results).to.deep.equal([
			{ error: false, data: binary }
		])
	})

	it('$ bulk huge string', function () {
		let binaryData = 'This is a string with invalid data...\r\n so bulk is needed'
		parser.parse(Buffer.from('$'+Buffer.byteLength(binaryData)+'\r\n'+binaryData+'\r\n'))
		expect(results).to.deep.equal([
			{ error: false, data: binaryData }
		])
	})

	it(`:6 to be equal a number`, function () {
		parser.parse(Buffer.from(`:6\r\n`));
		expect(results).to.deep.equal([
			{ error: false, data: 6 }
		]);
	});

	it(`* array`, function () {
		parser.parse(Buffer.from(`*3\r\n$1\r\n1\r\n$5\r\nhello\r\n$5\r\ntedis\r\n`));
		expect(results).to.deep.equal([
			{
				error: false,
				data: ["1", "hello", "tedis"]
			}
		]);
	});

	it('*-1 null array for timeout', function() {
		const buffer = Buffer.from('*-1\r\n')
		parser.parse(buffer)
		expect(results).to.deep.equal([
			{ error: false, data: undefined, timedout: true }
		])
	})

	it('* complex xreadgroup response', function () {
		const buffer = Buffer.from(
		'*1\r\n'+
			'*2\r\n'+
				'$3\r\npos\r\n'+
				'*1\r\n'+
					'*2\r\n'+
						'$15\r\n1588255974134-0\r\n'+
						'*2\r\n'+
							'$5\r\nevent\r\n$835\r\n'+
							'{"type":"OrderItemCreated","id":"e1712359-def3-4eed-bdfd-5b3b717ed647","tenant":"90404621-4dc5-4b11-be43-f5665b3e9c1a","company":"4964ec65-674c-44e1-8644-8205a8d57af4","item":"9086139e-1f10-4082-b6f2-a73854e370f8","author":{"id":"90f14d65-fc65-4899-aff1-b075410dfa09","name":"Daniel Froz"},"created":{"id":"9086139e-1f10-4082-b6f2-a73854e370f8","customer":{"id":"8dce6eff-f028-4b87-82a0-73848f099086","name":"Mesa 01"},"product":{"id":"4f651730-3f3c-44b5-813b-41ca192bdbca","name":"Burger Piu Piu"},"price":"12.00","qty":1,"total":"12.00","priceVariable":false,"tenant":"90404621-4dc5-4b11-be43-f5665b3e9c1a","company":"4964ec65-674c-44e1-8644-8205a8d57af4","author":{"id":"90f14d65-fc65-4899-aff1-b075410dfa09","name":"Daniel Froz"},"colors":{},"created":"2020-04-30T14:12:54.110Z","tax":false},"timestamp":"2020-04-30T14:12:54.092Z"}\r\n'
		)
		parser.parse(buffer)
		expect(results).to.deep.equal([
			{
				error: false,
				data: [
					[
						'pos',
						[
							[
								'1588255974134-0',
								[
									'event',
									"{\"type\":\"OrderItemCreated\",\"id\":\"e1712359-def3-4eed-bdfd-5b3b717ed647\",\"tenant\":\"90404621-4dc5-4b11-be43-f5665b3e9c1a\",\"company\":\"4964ec65-674c-44e1-8644-8205a8d57af4\",\"item\":\"9086139e-1f10-4082-b6f2-a73854e370f8\",\"author\":{\"id\":\"90f14d65-fc65-4899-aff1-b075410dfa09\",\"name\":\"Daniel Froz\"},\"created\":{\"id\":\"9086139e-1f10-4082-b6f2-a73854e370f8\",\"customer\":{\"id\":\"8dce6eff-f028-4b87-82a0-73848f099086\",\"name\":\"Mesa 01\"},\"product\":{\"id\":\"4f651730-3f3c-44b5-813b-41ca192bdbca\",\"name\":\"Burger Piu Piu\"},\"price\":\"12.00\",\"qty\":1,\"total\":\"12.00\",\"priceVariable\":false,\"tenant\":\"90404621-4dc5-4b11-be43-f5665b3e9c1a\",\"company\":\"4964ec65-674c-44e1-8644-8205a8d57af4\",\"author\":{\"id\":\"90f14d65-fc65-4899-aff1-b075410dfa09\",\"name\":\"Daniel Froz\"},\"colors\":{},\"created\":\"2020-04-30T14:12:54.110Z\",\"tax\":false},\"timestamp\":\"2020-04-30T14:12:54.092Z\"}"
								]
							]
						]
					]
				]
			}
		])
	})

	it('parsing complex huge data', function() {
		let hugeString = ''
		for(let i=0; i < 1000; i++) {
			hugeString += 'This is a huge string... will take some bytes of memory... but that\'s ok.'
		}
		const buffer = Buffer.from('*2\r\n'
			+'$'+Buffer.byteLength(hugeString)+'\r\n'+hugeString+'\r\n'
			+'$'+Buffer.byteLength(hugeString)+'\r\n'+hugeString+'\r\n')
		parser.parse(buffer)
		expect(results).to.length(1)
		expect(results[0].error).to.equal(false)
		expect(results[0].data).to.length(2)
		expect(results[0].data).to.deep.equal([ hugeString, hugeString ])
	})

	/**
	 * This test may run for 5 mins... so grab a coffee and wait... 
	 * This is why it's disabled by default
	 */
	xit('testing parser for memory leaks', async function() {
		this.timeout(300 * 1000)
		const buffer = Buffer.from('+All your base are belong to us\r\n')
		const baseline = process.memoryUsage()

		console.log('mem: heap used: %o MB', Math.round(process.memoryUsage().heapUsed / 1024 / 1024 * 100) / 100)

		let shown10 = false
		let shown50 = false
		let growthPercentage = 0
		for(let i=0; i < 1_000_000; i++) {
			parser.parse(buffer)
			results.splice(0, results.length)
			growthPercentage = (1-(baseline.heapUsed / process.memoryUsage().heapUsed)) * 100
			if(growthPercentage > 10 && !shown10) {
				console.error('10% increase....')
				shown10 = true
			}
			else if(growthPercentage > 50 && !shown50) {
				console.error('50% increase...')
				shown50 = true
			}
			else if(growthPercentage > 100) {
				console.error('Really??!?!? Something is wrong!')
				break
			}
			parser.clear()
		}
		const final = process.memoryUsage()
		console.log('growthPercentage: %o%', Math.round(growthPercentage * 100) / 100)
		console.log('mem: final heap used: %o MB', Math.round(final.heapUsed / 1024 / 1024 * 100) / 100)
		expect(growthPercentage).to.lessThan(10)
	})
});