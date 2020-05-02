import { Encoder } from "./encoder";
import { expect } from 'chai'

interface Encode {
	title: string;
	input: Array<string | number>;
	output: string;
}

describe("Encoder tests", () => {
	const encoder = new Encoder()
	const mock: Encode[] = [
		{
			title: "set",
			input: ["SET", "string1", "124235"],
			output: `*3\r\n$3\r\nSET\r\n$7\r\nstring1\r\n$6\r\n124235\r\n`,
		},
		{
			title: "get",
			input: ["GET", "string1"],
			output: `*2\r\n$3\r\nGET\r\n$7\r\nstring1\r\n`,
		},
		{
			title: "del",
			input: ["DEL", "string1"],
			output: `*2\r\n$3\r\nDEL\r\n$7\r\nstring1\r\n`,
		},
	];
	mock.forEach(item => {
		it(item.title, () => {
			expect(encoder.encode(...item.input)).to.equal(item.output);
		});
	});

	it(`error parameter`, () => {
		expect(() => {
			try {
				encoder.encode([1, 2, 3] as any);
			} catch (error) {
				throw new Error(error);
			}
		}).to.throw(Error);
	});
});
