export class Encoder {
	encode(...parameters: Array<string | number>): string {
		const length = parameters.length;
		let request = `*${length}\r\n`;
		for(const parameter of parameters) {
			if (typeof parameter === "string") {
				request += `$${Buffer.byteLength(parameter)}\r\n${parameter}\r\n`;
			} else if (typeof parameter === "number") {
				const str = parameter.toString()
				request += `$${Buffer.byteLength(str)}\r\n${str}\r\n`;
			} else {
				throw new Error("encode ags err");
			}
		}
		return request;
	}
}