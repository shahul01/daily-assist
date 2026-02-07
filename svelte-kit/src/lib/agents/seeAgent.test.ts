import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SeeAgentInputSchema, seeAgent, type SceneAnalysis } from './seeAgent';

const mockAnalysis: SceneAnalysis = {
	timestamp: new Date().toISOString(),
	description: 'You are in a kitchen with a person at the stove.',
	objects: [
		{ type: 'person', count: 1, position: 'center' },
		{ type: 'stove', position: "12 o'clock" }
	],
	text: ['EXIT', 'Fire Extinguisher'],
	dangers: [
		{
			type: 'hot_surface',
			severity: 'high',
			location: "12 o'clock, 2 feet",
			warning: 'Hot stove directly ahead.',
			requiresImmediate: false
		}
	],
	navigation: {
		obstacles: [{ description: 'Chair', position: "3 o'clock", distance: '1 foot' }],
		clearPath: false,
		guidance: "Obstacle at 3 o'clock. Path not clear."
	},
	confidence: 0.9
};

vi.mock('$lib/utils/gemini', () => ({
	callGeminiWithVision: vi.fn().mockResolvedValue('{}'),
	parseGeminiJson: vi.fn()
}));

describe('SeeAgentInputSchema', () => {
	it('accepts valid input with defaults', () => {
		const out = SeeAgentInputSchema.parse({ cameraFrame: 'data:image/jpeg;base64,abc' });
		expect(out.cameraFrame).toContain('base64');
		expect(out.mode).toBe('full');
		expect(out.userId).toBe('anonymous');
		expect(out.voiceMode).toBe('smart');
	});

	it('rejects empty camera frame', () => {
		expect(() => SeeAgentInputSchema.parse({ cameraFrame: '' })).toThrow();
	});

	it('accepts mode and voiceMode', () => {
		const out = SeeAgentInputSchema.parse({
			cameraFrame: 'base64data',
			mode: 'dangers',
			voiceMode: 'auto'
		});
		expect(out.mode).toBe('dangers');
		expect(out.voiceMode).toBe('auto');
	});
});

describe('SeeAgent', () => {
	beforeEach(async () => {
		vi.clearAllMocks();
		const { parseGeminiJson } = await import('$lib/utils/gemini');
		vi.mocked(parseGeminiJson).mockReturnValue(mockAnalysis);
	});

	it('shouldSpeakForMode returns shouldSpeak true for auto', () => {
		const { shouldSpeak, text } = seeAgent.shouldSpeakForMode(mockAnalysis, 'auto');
		expect(shouldSpeak).toBe(true);
		expect(text.length).toBeGreaterThan(0);
		expect(text).toContain('kitchen');
	});

	it('shouldSpeakForMode returns shouldSpeak true for smart when dangers present', () => {
		const { shouldSpeak, text } = seeAgent.shouldSpeakForMode(mockAnalysis, 'smart');
		expect(shouldSpeak).toBe(true);
		expect(text).toContain('Hot stove');
	});

	it('shouldSpeakForMode returns shouldSpeak false for manual', () => {
		const { shouldSpeak, text } = seeAgent.shouldSpeakForMode(mockAnalysis, 'manual');
		expect(shouldSpeak).toBe(false);
		expect(text.length).toBeGreaterThan(0);
	});

	it('shouldSpeakForMode smart returns false when no dangers and clear path', () => {
		const clear: SceneAnalysis = {
			...mockAnalysis,
			dangers: [],
			navigation: { obstacles: [], clearPath: true }
		};
		const { shouldSpeak } = seeAgent.shouldSpeakForMode(clear, 'smart');
		expect(shouldSpeak).toBe(false);
	});

	it('getPriority returns emergency for critical danger', () => {
		const critical: SceneAnalysis = {
			...mockAnalysis,
			dangers: [
				{
					type: 'fire',
					severity: 'critical',
					location: 'ahead',
					warning: 'Fire!',
					requiresImmediate: true
				}
			]
		};
		expect(seeAgent.getPriority(critical)).toBe('emergency');
	});

	it('getPriority returns high for high severity', () => {
		expect(seeAgent.getPriority(mockAnalysis)).toBe('high');
	});

	it('getPriority returns normal when no high/critical dangers', () => {
		const safe: SceneAnalysis = {
			...mockAnalysis,
			dangers: [
				{
					type: 'obstacle',
					severity: 'low',
					location: 'left',
					warning: 'Small obstacle',
					requiresImmediate: false
				}
			]
		};
		expect(seeAgent.getPriority(safe)).toBe('normal');
	});

	it('buildSpeechText includes description for auto', () => {
		const text = seeAgent.buildSpeechText(mockAnalysis, 'auto');
		expect(text).toContain('kitchen');
		expect(text).toContain('Hot stove');
		expect(text).toContain('EXIT');
	});

	it('analyzeFrame returns analysis and shouldSpeak based on voiceMode', async () => {
		const result = await seeAgent.analyzeFrame({
			cameraFrame: 'data:image/jpeg;base64,xyz',
			mode: 'full',
			userId: 'test-user',
			voiceMode: 'smart',
			mimeType: 'image/jpeg',
			detailLevel: 'brief'
		});
		expect(result.analysis).toBeDefined();
		expect(result.analysis.description).toBe(mockAnalysis.description);
		expect(result.speechText).toBeDefined();
		expect(['emergency', 'high', 'normal']).toContain(result.priority);
	});
});
