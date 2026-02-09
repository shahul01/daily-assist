import { z } from 'zod';
import { callGeminiWithVision, callGeminiWithInlineData, parseGeminiJson } from '$lib/utils/gemini';

/** Danger types for accessibility / safety */
export const DANGER_TYPES = [
	'fire',
	'hot_surface',
	'sharp',
	'obstacle',
	'moving_vehicle',
	'stairs',
	'spill',
	'smoke'
] as const;

/** Severity for dangers and alerts */
export const SEVERITY_LEVELS = ['critical', 'high', 'medium', 'low'] as const;

export type DangerType = (typeof DANGER_TYPES)[number];
export type Severity = (typeof SEVERITY_LEVELS)[number];

export interface DetectedObject {
	type: string;
	count?: number;
	position?: string;
	description?: string;
	confidence?: number;
}

export interface Danger {
	type: DangerType | string;
	severity: Severity;
	location: string;
	warning: string;
	requiresImmediate: boolean;
}

export interface NavigationInfo {
	obstacles: Array<{ description: string; position: string; distance?: string }>;
	clearPath: boolean;
	guidance?: string;
}

/** Medicine identification from pill or label image (safety-critical). */
export interface MedicineIdentification {
	pillDescription?: {
		shape: string;
		color: string;
		imprintCodes: string[];
	};
	labelText?: string;
	brandName?: string;
	genericName?: string;
	expirationDate?: string;
	confidence: 'high' | 'medium' | 'low';
	safetyWarnings?: string[];
}

export interface SceneAnalysis {
	timestamp: string;
	description: string;
	objects: DetectedObject[];
	text: string[];
	dangers: Danger[];
	navigation: NavigationInfo;
	confidence: number;
}

export type SeeAgentMode = 'scene' | 'objects' | 'navigation' | 'dangers' | 'full';

export type VoiceMode = 'auto' | 'smart' | 'manual';

const SceneAnalysisSchema = z.object({
	timestamp: z.string(),
	description: z.string(),
	objects: z.array(
		z.object({
			type: z.string(),
			count: z.number().optional(),
			position: z.string().optional(),
			description: z.string().optional(),
			confidence: z.number().optional()
		})
	),
	text: z.array(z.string()),
	dangers: z.array(
		z.object({
			type: z.string(),
			severity: z.enum(['critical', 'high', 'medium', 'low']),
			location: z.string(),
			warning: z.string(),
			requiresImmediate: z.boolean()
		})
	),
	navigation: z.object({
		obstacles: z.array(
			z.object({
				description: z.string(),
				position: z.string(),
				distance: z.string().optional()
			})
		),
		clearPath: z.boolean(),
		guidance: z.string().optional()
	}),
	confidence: z.number().min(0).max(1)
});

export const SeeAgentInputSchema = z.object({
	cameraFrame: z.string().min(1, 'Camera frame required'),
	mode: z.enum(['scene', 'objects', 'navigation', 'dangers', 'full']).default('full'),
	userId: z.string().min(1).default('anonymous'),
	mimeType: z.string().max(50).optional().default('image/jpeg'),
	detailLevel: z.enum(['brief', 'detailed']).optional().default('brief'),
	voiceMode: z.enum(['auto', 'smart', 'manual']).optional().default('smart')
});

export type SeeAgentInput = z.infer<typeof SeeAgentInputSchema>;

export interface SeeAgentOutput {
	analysis: SceneAnalysis;
	speechText: string;
	shouldSpeak: boolean;
	priority: 'emergency' | 'high' | 'normal';
}

const SYSTEM_PROMPT = `You are a See-For-Me assistant for blind and low-vision users.
Analyze the image from the user's camera and return a single JSON object (no markdown, no code fences).
Include:
- description: One clear sentence describing the scene (e.g. "You're in a kitchen with a person at the stove.")
- objects: Array of { type, count?, position?, description?, confidence? } for notable objects (people, furniture, hazards, vehicles).
- text: Array of all visible text strings (signs, labels, menus) in reading order.
- dangers: Array of { type, severity, location, warning, requiresImmediate }. Types: fire, hot_surface, sharp, obstacle, moving_vehicle, stairs, spill, smoke. Severity: critical, high, medium, low. requiresImmediate true only for critical.
- navigation: { obstacles: [{ description, position (e.g. "12 o'clock", "3 o'clock"), distance? }], clearPath: boolean, guidance?: string }.
- confidence: 0-1.
Use clock positions (12, 1, 2, ... 11) for directions. Be concise for real-time use.`;

function buildAnalysisPrompt(mode: SeeAgentMode, detailLevel: 'brief' | 'detailed'): string {
	const detail = detailLevel === 'detailed' ? 'Include positions and counts for all objects.' : '';
	switch (mode) {
		case 'scene':
			return `Focus on scene description only. One sentence. ${detail}`;
		case 'objects':
			return `Focus on listing objects with type and position. ${detail}`;
		case 'navigation':
			return `Focus on obstacles and path. Use clock positions. ${detail}`;
		case 'dangers':
			return `Focus on safety: list any dangers with severity and location. ${detail}`;
		default:
			return `Full analysis. ${detail}`;
	}
}

/**
 * See-For-Me Agent: real-time vision for blind/low-vision users.
 * Thinking level: LOW for speed.
 */
export class SeeAgent {
	/**
	 * Identify medicine from pill or packaging image. Use high thinking for safety.
	 */
	async identifyMedicine(
		imageBase64: string,
		mimeType = 'image/jpeg'
	): Promise<MedicineIdentification> {
		const prompt = `You are helping identify medicine from a pill or packaging image for user safety.
Analyze the image and return a single JSON object (no markdown, no code fences) with:
- pillDescription: optional { shape, color, imprintCodes: string[] } if a pill is visible
- labelText: any visible text on packaging or label (OCR)
- brandName: brand name if visible
- genericName: generic drug name if visible
- expirationDate: if visible on packaging
- confidence: "high" | "medium" | "low" based on clarity and completeness
- safetyWarnings: string[] of any visible warnings (e.g. "Do not drive", "Take with food")
If nothing medicine-related is clearly visible, set confidence to "low" and omit other fields where unknown.`;
		const raw = await callGeminiWithInlineData(prompt, imageBase64, mimeType, {
			thinkingLevel: 'high',
			model: 'gemini-3-pro-preview'
		});
		const parsed = parseGeminiJson(raw) as Record<string, unknown>;
		const pillDesc = parsed.pillDescription as
			| { shape?: string; color?: string; imprintCodes?: string[] }
			| undefined;
		return {
			pillDescription: pillDesc
				? {
						shape: typeof pillDesc.shape === 'string' ? pillDesc.shape : '',
						color: typeof pillDesc.color === 'string' ? pillDesc.color : '',
						imprintCodes: Array.isArray(pillDesc.imprintCodes)
							? pillDesc.imprintCodes.map(String)
							: []
					}
				: undefined,
			labelText: typeof parsed.labelText === 'string' ? parsed.labelText : undefined,
			brandName: typeof parsed.brandName === 'string' ? parsed.brandName : undefined,
			genericName: typeof parsed.genericName === 'string' ? parsed.genericName : undefined,
			expirationDate: typeof parsed.expirationDate === 'string' ? parsed.expirationDate : undefined,
			confidence:
				parsed.confidence === 'high' || parsed.confidence === 'medium'
					? (parsed.confidence as 'high' | 'medium')
					: 'low',
			safetyWarnings: Array.isArray(parsed.safetyWarnings)
				? (parsed.safetyWarnings as string[]).filter((s) => typeof s === 'string')
				: undefined
		};
	}

	/**
	 * Analyze a single camera frame and return structured scene analysis.
	 */
	async analyzeFrame(input: SeeAgentInput): Promise<SeeAgentOutput> {
		const validated = SeeAgentInputSchema.parse(input);
		const prompt = `${SYSTEM_PROMPT}\n\n${buildAnalysisPrompt(validated.mode, validated.detailLevel)}\n\nReply with ONLY the JSON object.`;
		const raw = await callGeminiWithVision(
			prompt,
			validated.cameraFrame,
			validated.mimeType ?? 'image/jpeg'
		);
		const parsed = parseGeminiJson(raw) as Record<string, unknown>;
		const analysis = this.normalizeAnalysis(parsed);
		const { shouldSpeak, text: speechText } = this.shouldSpeakForMode(
			analysis,
			validated.voiceMode ?? 'smart'
		);
		const priority = this.getPriority(analysis);

		return {
			analysis: { ...analysis, timestamp: new Date().toISOString() },
			speechText,
			shouldSpeak,
			priority
		};
	}

	/**
	 * Determine if response should be spoken based on voice mode and content.
	 */
	shouldSpeakForMode(
		analysis: SceneAnalysis,
		voiceMode: VoiceMode
	): { shouldSpeak: boolean; text: string } {
		const text = this.buildSpeechText(analysis, voiceMode);
		if (!text) return { shouldSpeak: false, text: '' };
		switch (voiceMode) {
			case 'auto':
				return { shouldSpeak: true, text };
			case 'smart': {
				const hasDangers = analysis.dangers.length > 0;
				const hasNavWarning =
					!analysis.navigation.clearPath && analysis.navigation.obstacles.length > 0;
				return { shouldSpeak: hasDangers || hasNavWarning, text };
			}
			default:
				return { shouldSpeak: false, text };
		}
	}

	/**
	 * Build a single TTS-friendly string from analysis (for auto/smart or manual speak).
	 */
	buildSpeechText(analysis: SceneAnalysis, voiceMode: VoiceMode): string {
		const parts: string[] = [];
		// Always include critical/high dangers first
		const urgentDangers = analysis.dangers.filter(
			(d) => d.severity === 'critical' || d.severity === 'high'
		);
		if (urgentDangers.length > 0) {
			parts.push(...urgentDangers.map((d) => `Warning: ${d.warning} ${d.location}`));
		}
		if (voiceMode === 'auto') {
			parts.push(analysis.description);
			if (analysis.navigation && !analysis.navigation.clearPath && analysis.navigation.guidance) {
				parts.push(analysis.navigation.guidance);
			}
			if (analysis.text.length > 0) {
				parts.push(`Visible text: ${analysis.text.join(', ')}`);
			}
		} else if (
			voiceMode === 'smart' &&
			(urgentDangers.length > 0 || !analysis.navigation.clearPath)
		) {
			if (!analysis.navigation.clearPath && analysis.navigation.guidance) {
				parts.push(analysis.navigation.guidance);
			}
		}
		return parts.filter(Boolean).join('. ');
	}

	getPriority(analysis: SceneAnalysis): 'emergency' | 'high' | 'normal' {
		const hasCritical = analysis.dangers.some((d) => d.severity === 'critical');
		const hasHigh = analysis.dangers.some((d) => d.severity === 'high');
		if (hasCritical) return 'emergency';
		if (hasHigh) return 'high';
		return 'normal';
	}

	private normalizeAnalysis(parsed: Record<string, unknown>): SceneAnalysis {
		const result = SceneAnalysisSchema.safeParse({
			timestamp: parsed.timestamp ?? new Date().toISOString(),
			description: typeof parsed.description === 'string' ? parsed.description : 'Unknown scene',
			objects: Array.isArray(parsed.objects) ? parsed.objects : [],
			text: Array.isArray(parsed.text) ? parsed.text : [],
			dangers: Array.isArray(parsed.dangers) ? parsed.dangers : [],
			navigation:
				parsed.navigation && typeof parsed.navigation === 'object'
					? {
							obstacles: Array.isArray((parsed.navigation as Record<string, unknown>).obstacles)
								? (parsed.navigation as { obstacles: NavigationInfo['obstacles'] }).obstacles
								: [],
							clearPath: (parsed.navigation as Record<string, unknown>).clearPath === true,
							guidance:
								typeof (parsed.navigation as Record<string, unknown>).guidance === 'string'
									? (parsed.navigation as { guidance: string }).guidance
									: undefined
						}
					: { obstacles: [], clearPath: true },
			confidence:
				typeof parsed.confidence === 'number' && parsed.confidence >= 0 && parsed.confidence <= 1
					? parsed.confidence
					: 0.8
		});
		if (result.success) return result.data;
		return {
			timestamp: new Date().toISOString(),
			description: 'Unable to analyze scene.',
			objects: [],
			text: [],
			dangers: [],
			navigation: { obstacles: [], clearPath: true },
			confidence: 0
		};
	}
}

export const seeAgent = new SeeAgent();
