import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { sayAgent } from '$lib/agents/sayAgent';

export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = (await request.json()) as Record<string, unknown>;

		// speak: { text, emotion?, pitch?, rate?, volume?, lang?, voiceUri?, userId? }
		if (body.speak && typeof (body.speak as { text?: string }).text === 'string') {
			const p = body.speak as {
				text: string;
				emotion?: string;
				pitch?: number;
				rate?: number;
				volume?: number;
				lang?: string;
				voiceUri?: string;
				userId?: string;
			};
			const result = await sayAgent.speak({
				text: p.text,
				emotion: p.emotion as Parameters<typeof sayAgent.speak>[0]['emotion'],
				pitch: p.pitch,
				rate: p.rate,
				volume: p.volume,
				lang: p.lang,
				voiceUri: p.voiceUri,
				userId: p.userId
			});
			return json(result);
		}

		// quickPhrase: { phraseId, userId }
		if (body.quickPhrase && typeof body.quickPhrase === 'object') {
			const { phraseId, userId } = body.quickPhrase as { phraseId?: string; userId?: string };
			if (!phraseId || !userId) {
				return json({ error: 'quickPhrase requires phraseId and userId' }, { status: 400 });
			}
			const result = await sayAgent.quickPhrase({ phraseId, userId });
			return json(result);
		}

		// emergency: { message, repeatCount?, userId? }
		if (body.emergency && typeof (body.emergency as { message?: string }).message === 'string') {
			const payload = body.emergency as { message: string; repeatCount?: number; userId?: string };
			const result = await sayAgent.emergency({
				message: payload.message,
				repeatCount: payload.repeatCount,
				userId: payload.userId
			});
			return json(result);
		}

		// saveQuickPhrase: { userId, phrase, category?, emotion?, language?, isDefault? }
		if (body.saveQuickPhrase && typeof body.saveQuickPhrase === 'object') {
			const p = body.saveQuickPhrase as {
				userId?: string;
				phrase?: string;
				category?: string;
				emotion?: string;
				language?: string;
				isDefault?: boolean;
			};
			if (!p.userId || !p.phrase) {
				return json({ error: 'saveQuickPhrase requires userId and phrase' }, { status: 400 });
			}
			const result = await sayAgent.saveQuickPhrase({
				userId: p.userId,
				phrase: p.phrase,
				category: p.category as Parameters<typeof sayAgent.saveQuickPhrase>[0]['category'],
				emotion: p.emotion as Parameters<typeof sayAgent.saveQuickPhrase>[0]['emotion'],
				language: p.language,
				isDefault: p.isDefault ?? false
			});
			return json(result);
		}

		// loadQuickPhrases: { userId, category? }
		if (body.loadQuickPhrases && typeof body.loadQuickPhrases === 'object') {
			const { userId, category } = body.loadQuickPhrases as { userId?: string; category?: string };
			if (!userId) {
				return json({ error: 'loadQuickPhrases requires userId' }, { status: 400 });
			}
			const result = await sayAgent.loadQuickPhrases(
				userId,
				category as Parameters<typeof sayAgent.loadQuickPhrases>[1]
			);
			return json({ phrases: result });
		}

		// deleteQuickPhrase: { phraseId, userId }
		if (body.deleteQuickPhrase && typeof body.deleteQuickPhrase === 'object') {
			const { phraseId, userId } = body.deleteQuickPhrase as { phraseId?: string; userId?: string };
			if (!phraseId || !userId) {
				return json({ error: 'deleteQuickPhrase requires phraseId and userId' }, { status: 400 });
			}
			await sayAgent.deleteQuickPhrase({ phraseId, userId });
			return json({ ok: true });
		}

		// loadVoicePreferences: { userId }
		if (body.loadVoicePreferences && typeof body.loadVoicePreferences === 'object') {
			const { userId } = body.loadVoicePreferences as { userId?: string };
			if (!userId) {
				return json({ error: 'loadVoicePreferences requires userId' }, { status: 400 });
			}
			const result = await sayAgent.loadVoicePreferences(userId);
			return json(result ?? {});
		}

		// saveVoicePreferences: { userId, pitch?, rate?, volume?, language?, voiceUri?, emergencyVolume?, emergencyRate? }
		if (body.saveVoicePreferences && typeof body.saveVoicePreferences === 'object') {
			const p = body.saveVoicePreferences as {
				userId?: string;
				pitch?: number;
				rate?: number;
				volume?: number;
				language?: string;
				voiceUri?: string;
				emergencyVolume?: number;
				emergencyRate?: number;
			};
			if (!p.userId) {
				return json({ error: 'saveVoicePreferences requires userId' }, { status: 400 });
			}
			const result = await sayAgent.saveVoicePreferences({
				userId: p.userId,
				pitch: p.pitch,
				rate: p.rate,
				volume: p.volume,
				language: p.language,
				voiceUri: p.voiceUri,
				emergencyVolume: p.emergencyVolume,
				emergencyRate: p.emergencyRate
			});
			return json(result);
		}

		return json(
			{
				error:
					'Missing payload: provide speak, quickPhrase, emergency, saveQuickPhrase, loadQuickPhrases, deleteQuickPhrase, loadVoicePreferences, or saveVoicePreferences'
			},
			{ status: 400 }
		);
	} catch (error) {
		console.error('Say agent API error:', error);
		return json(
			{
				error: 'Say agent failed',
				message: error instanceof Error ? error.message : 'Unknown error'
			},
			{ status: 500 }
		);
	}
};
