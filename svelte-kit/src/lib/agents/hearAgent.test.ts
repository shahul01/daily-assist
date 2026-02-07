import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
	HearAgentInputSchema,
	hearAgent,
	type DetectedSound,
	type HearAgentOutput,
	type Sentiment
} from './hearAgent';

const mockSounds: DetectedSound[] = [
	{
		type: 'doorbell',
		confidence: 0.9,
		urgency: 'high',
		timestamp: new Date().toISOString(),
		description: 'Doorbell ring'
	}
];

const mockCriticalSound: DetectedSound[] = [
	{
		type: 'smoke_alarm',
		confidence: 0.95,
		urgency: 'critical',
		timestamp: new Date().toISOString()
	}
];

vi.mock('$lib/utils/gemini', () => ({
	callGeminiWithAudio: vi.fn().mockResolvedValue('{}'),
	parseGeminiJson: vi.fn()
}));

describe('HearAgentInputSchema', () => {
	it('accepts valid input with defaults', () => {
		const out = HearAgentInputSchema.parse({ audioChunk: 'base64audio' });
		expect(out.audioChunk).toBe('base64audio');
		expect(out.mode).toBe('full');
		expect(out.userId).toBe('anonymous');
		expect(out.mimeType).toBe('audio/webm');
	});

	it('rejects empty audio chunk', () => {
		expect(() => HearAgentInputSchema.parse({ audioChunk: '' })).toThrow();
	});

	it('accepts mode and clientTranscript', () => {
		const out = HearAgentInputSchema.parse({
			audioChunk: 'abc',
			mode: 'sounds',
			clientTranscript: 'Hello world'
		});
		expect(out.mode).toBe('sounds');
		expect(out.clientTranscript).toBe('Hello world');
	});
});

describe('HearAgent', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('buildAlert returns emergency for critical sounds', () => {
		const result = hearAgent.buildAlert({ sounds: mockCriticalSound });
		expect(result.shouldAlert).toBe(true);
		expect(result.alertPriority).toBe('emergency');
		expect(result.alertText).toContain('Emergency');
	});

	it('buildAlert returns high for high-urgency sounds', () => {
		const result = hearAgent.buildAlert({ sounds: mockSounds });
		expect(result.shouldAlert).toBe(true);
		expect(result.alertPriority).toBe('high');
		expect(result.alertText).toContain('Important');
	});

	it('buildAlert returns no alert for low-urgency only', () => {
		const result = hearAgent.buildAlert({
			sounds: [
				{ type: 'other', confidence: 0.5, urgency: 'low', timestamp: new Date().toISOString() }
			]
		});
		expect(result.shouldAlert).toBe(false);
		expect(result.alertPriority).toBe('normal');
	});

	it('buildAlert returns high for urgent sentiment', () => {
		const sentiment: Sentiment = {
			emotion: 'anxious',
			intensity: 0.9,
			confidence: 0.8,
			tone: 'urgent'
		};
		const result = hearAgent.buildAlert({ sounds: [], sentiment });
		expect(result.shouldAlert).toBe(true);
		expect(result.alertPriority).toBe('high');
		expect(result.alertText).toContain('Urgent tone');
	});

	it('analyzeAudioChunk returns structured output with mocked Gemini', async () => {
		const { parseGeminiJson } = await import('$lib/utils/gemini');
		vi.mocked(parseGeminiJson).mockReturnValue({
			transcript: 'Test transcript',
			sounds: mockSounds,
			speaker: { speakerId: 's1', confidence: 0.8, isNewSpeaker: true },
			sentiment: { emotion: 'neutral', intensity: 0.5, confidence: 0.7, tone: 'casual' }
		});

		const result = await hearAgent.analyzeAudioChunk({
			audioChunk: 'fakeBase64',
			mode: 'full',
			userId: 'user1',
			mimeType: 'audio/webm'
		});

		expect(result).toMatchObject({
			transcript: 'Test transcript',
			shouldAlert: true,
			alertPriority: 'high',
			timestamp: expect.any(String)
		} as Partial<HearAgentOutput>);
		expect(result.sounds).toHaveLength(1);
		expect(result.sounds[0].type).toBe('doorbell');
		expect(result.speaker?.speakerId).toBe('s1');
		expect(result.sentiment?.emotion).toBe('neutral');
	});
});
