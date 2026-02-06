import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ReadAgentInputSchema, readAgent } from './readAgent';

vi.mock('$lib/utils/gemini', () => ({
	callGemini: vi
		.fn()
		.mockResolvedValue({ text: 'Formatted text for speech.', thoughtSignature: undefined }),
	callGeminiWithImage: vi.fn().mockResolvedValue('Image description with OCR text.'),
	callGeminiWithInlineData: vi.fn().mockResolvedValue('PDF content extracted.'),
	parseGeminiJson: vi.fn().mockReturnValue([])
}));

describe('ReadAgentInputSchema', () => {
	it('accepts valid input with defaults', () => {
		const out = ReadAgentInputSchema.parse({ text: 'Hello' });
		expect(out.text).toBe('Hello');
		expect(out.speed).toBe('normal');
		expect(out.format).toBe('plain');
	});

	it('rejects empty text', () => {
		expect(() => ReadAgentInputSchema.parse({ text: '' })).toThrow();
	});

	it('accepts speed and format', () => {
		const out = ReadAgentInputSchema.parse({
			text: 'Hi',
			speed: 'slow',
			format: 'structured'
		});
		expect(out.speed).toBe('slow');
		expect(out.format).toBe('structured');
	});
});

describe('ReadAgent', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('read() returns spokenText and thoughtSignature', async () => {
		const result = await readAgent.read({ text: 'Test paragraph.' });
		expect(result).toHaveProperty('spokenText');
		expect(typeof result.spokenText).toBe('string');
	});

	it('readImage() returns string description', async () => {
		const out = await readAgent.readImage('base64data', 'image/png');
		expect(typeof out).toBe('string');
	});

	it('readVisibleText() returns string array', async () => {
		const { parseGeminiJson } = await import('$lib/utils/gemini');
		vi.mocked(parseGeminiJson).mockReturnValue(['Line 1', 'Line 2']);
		const out = await readAgent.readVisibleText('base64', 'image/jpeg');
		expect(Array.isArray(out)).toBe(true);
		expect(out).toContain('Line 1');
	});
});
