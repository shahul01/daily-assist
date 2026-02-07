import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
	SpeakInputSchema,
	EmergencyInputSchema,
	SaveQuickPhraseInputSchema,
	SUPPORTED_LANGUAGES
} from './sayAgent';
import { sayAgent } from './sayAgent.server';

vi.mock('$lib/server/supabase', () => ({
	supabaseServer: {
		from: vi.fn(() => ({
			select: vi.fn().mockReturnThis(),
			insert: vi.fn().mockReturnThis(),
			update: vi.fn().mockReturnThis(),
			upsert: vi.fn().mockReturnThis(),
			delete: vi.fn().mockReturnThis(),
			eq: vi.fn().mockReturnThis(),
			order: vi.fn().mockReturnThis(),
			single: vi.fn().mockResolvedValue({
				data: null,
				error: { code: 'PGRST116', message: 'No rows' }
			})
			// quickPhrase path needs a row
		}))
	}
}));

vi.mock('$lib/utils/gemini', () => ({
	callGemini: vi.fn().mockResolvedValue({ text: 'en-US' })
}));

describe('SayAgent schemas', () => {
	it('SpeakInputSchema accepts valid input with defaults', () => {
		const out = SpeakInputSchema.parse({ text: 'Hello' });
		expect(out.text).toBe('Hello');
		expect(out.emotion).toBeUndefined();
	});

	it('SpeakInputSchema rejects empty text', () => {
		expect(() => SpeakInputSchema.parse({ text: '' })).toThrow();
	});

	it('SpeakInputSchema accepts emotion and options', () => {
		const out = SpeakInputSchema.parse({
			text: 'Hi',
			emotion: 'urgent',
			rate: 1.2,
			lang: 'es-ES'
		});
		expect(out.emotion).toBe('urgent');
		expect(out.rate).toBe(1.2);
		expect(out.lang).toBe('es-ES');
	});

	it('EmergencyInputSchema accepts message and defaults repeatCount to 3', () => {
		const out = EmergencyInputSchema.parse({ message: 'Help' });
		expect(out.message).toBe('Help');
		expect(out.repeatCount).toBe(3);
	});

	it('EmergencyInputSchema accepts custom repeatCount', () => {
		const out = EmergencyInputSchema.parse({ message: 'Help', repeatCount: 5 });
		expect(out.repeatCount).toBe(5);
	});

	it('SaveQuickPhraseInputSchema requires userId and phrase', () => {
		const out = SaveQuickPhraseInputSchema.parse({
			userId: 'user-1',
			phrase: 'Thank you'
		});
		expect(out.userId).toBe('user-1');
		expect(out.phrase).toBe('Thank you');
		expect(out.isDefault).toBe(false);
	});
});

describe('SUPPORTED_LANGUAGES', () => {
	it('has at least 20 entries', () => {
		expect(SUPPORTED_LANGUAGES.length).toBeGreaterThanOrEqual(20);
	});
	it('each entry has code and label', () => {
		for (const lang of SUPPORTED_LANGUAGES) {
			expect(lang).toHaveProperty('code');
			expect(lang).toHaveProperty('label');
			expect(typeof lang.code).toBe('string');
			expect(typeof lang.label).toBe('string');
		}
	});
});

describe('SayAgent', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('speak() returns payload with text, rate, pitch, volume, lang', async () => {
		const result = await sayAgent.speak({ text: 'Hello world' });
		expect(result).toHaveProperty('text', 'Hello world');
		expect(result).toHaveProperty('rate');
		expect(result).toHaveProperty('pitch');
		expect(result).toHaveProperty('volume');
		expect(result).toHaveProperty('lang');
		expect(typeof result.rate).toBe('number');
		expect(typeof result.pitch).toBe('number');
	});

	it('speak() with emotion returns modified rate/pitch', async () => {
		const neutral = await sayAgent.speak({ text: 'Hi', emotion: 'neutral' });
		const urgent = await sayAgent.speak({ text: 'Hi', emotion: 'urgent' });
		expect(urgent.rate).not.toBe(neutral.rate);
		expect(urgent.pitch).not.toBe(neutral.pitch);
	});

	it('emergency() returns payload with repeatCount', async () => {
		const result = await sayAgent.emergency({
			message: 'I need help',
			repeatCount: 2
		});
		expect(result.text).toBe('I need help');
		expect(result.repeatCount).toBe(2);
		expect(result.emotion).toBe('urgent');
	});
});
