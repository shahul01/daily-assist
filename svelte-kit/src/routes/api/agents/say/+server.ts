import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { sayAgent } from '$lib/agents/sayAgent.server';
import {
	getCloneStatus,
	speakWithClone,
	deleteVoiceClone as deleteVoiceCloneRecord
} from '$lib/agents/sayAgentVoiceClone';
import {
	startSession,
	endSession,
	addTurn,
	getSessionHistory,
	listSessions
} from '$lib/agents/liveConversation';

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

		// Tier 2: loadVoiceProfiles, saveVoiceProfile, deleteVoiceProfile, detectLanguage
		if (body.loadVoiceProfiles && typeof body.loadVoiceProfiles === 'object') {
			const { userId: uid } = body.loadVoiceProfiles as { userId?: string };
			if (!uid) return json({ error: 'loadVoiceProfiles requires userId' }, { status: 400 });
			const result = await sayAgent.listVoiceProfiles(uid);
			return json({ profiles: result });
		}
		if (body.saveVoiceProfile && typeof body.saveVoiceProfile === 'object') {
			const p = body.saveVoiceProfile as {
				userId?: string;
				name?: string;
				pitch?: number;
				rate?: number;
				volume?: number;
				language?: string;
				voiceUri?: string;
			};
			if (!p.userId || !p.name)
				return json({ error: 'saveVoiceProfile requires userId and name' }, { status: 400 });
			const result = await sayAgent.saveVoiceProfile({
				userId: p.userId,
				name: p.name,
				pitch: p.pitch,
				rate: p.rate,
				volume: p.volume,
				language: p.language,
				voiceUri: p.voiceUri
			});
			return json(result);
		}
		if (body.deleteVoiceProfile && typeof body.deleteVoiceProfile === 'object') {
			const { profileId, userId: uid } = body.deleteVoiceProfile as {
				profileId?: string;
				userId?: string;
			};
			if (!profileId || !uid)
				return json({ error: 'deleteVoiceProfile requires profileId and userId' }, { status: 400 });
			await sayAgent.deleteVoiceProfile(profileId, uid);
			return json({ ok: true });
		}
		if (body.getVoiceProfile && typeof body.getVoiceProfile === 'object') {
			const { profileId, userId: uid } = body.getVoiceProfile as {
				profileId?: string;
				userId?: string;
			};
			if (!profileId || !uid)
				return json({ error: 'getVoiceProfile requires profileId and userId' }, { status: 400 });
			const result = await sayAgent.getVoiceProfile(profileId, uid);
			return json(result ?? {});
		}
		if (body.detectLanguage && typeof body.detectLanguage === 'object') {
			const { text } = body.detectLanguage as { text?: string };
			if (typeof text !== 'string')
				return json({ error: 'detectLanguage requires text' }, { status: 400 });
			const result = await sayAgent.detectLanguage(text);
			return json({ language: result });
		}

		// Tier 3: voice clone
		if (body.getVoiceCloneStatus && typeof body.getVoiceCloneStatus === 'object') {
			const { userId: uid } = body.getVoiceCloneStatus as { userId?: string };
			if (!uid) return json({ error: 'getVoiceCloneStatus requires userId' }, { status: 400 });
			const result = await getCloneStatus(uid);
			return json(result);
		}
		if (body.speakWithClone && typeof body.speakWithClone === 'object') {
			const { text, userId: uid } = body.speakWithClone as { text?: string; userId?: string };
			if (!uid || typeof text !== 'string')
				return json({ error: 'speakWithClone requires userId and text' }, { status: 400 });
			const result = await speakWithClone(text, uid);
			return json(result ?? { error: 'Voice clone unavailable' });
		}
		if (body.deleteVoiceClone && typeof body.deleteVoiceClone === 'object') {
			const { userId: uid } = body.deleteVoiceClone as { userId?: string };
			if (!uid) return json({ error: 'deleteVoiceClone requires userId' }, { status: 400 });
			await deleteVoiceCloneRecord(uid);
			return json({ ok: true });
		}

		// Tier 3: conversation sessions
		if (body.conversationStart && typeof body.conversationStart === 'object') {
			const { userId: uid } = body.conversationStart as { userId?: string };
			if (!uid) return json({ error: 'conversationStart requires userId' }, { status: 400 });
			const result = await startSession(uid);
			return json(result);
		}
		if (body.conversationEnd && typeof body.conversationEnd === 'object') {
			const { sessionId, userId: uid } = body.conversationEnd as {
				sessionId?: string;
				userId?: string;
			};
			if (!sessionId || !uid)
				return json({ error: 'conversationEnd requires sessionId and userId' }, { status: 400 });
			await endSession(sessionId, uid);
			return json({ ok: true });
		}
		if (body.conversationAddTurn && typeof body.conversationAddTurn === 'object') {
			const p = body.conversationAddTurn as {
				sessionId?: string;
				speaker?: 'user' | 'assistant';
				text?: string;
				audioUrl?: string;
				emotion?: string;
			};
			if (!p.sessionId || !p.speaker)
				return json(
					{ error: 'conversationAddTurn requires sessionId and speaker' },
					{ status: 400 }
				);
			const result = await addTurn(p.sessionId, p.speaker, p.text ?? null, {
				audioUrl: p.audioUrl,
				emotion: p.emotion
			});
			return json(result);
		}
		if (body.conversationHistory && typeof body.conversationHistory === 'object') {
			const { sessionId, userId: uid } = body.conversationHistory as {
				sessionId?: string;
				userId?: string;
			};
			if (!sessionId || !uid)
				return json(
					{ error: 'conversationHistory requires sessionId and userId' },
					{ status: 400 }
				);
			const result = await getSessionHistory(sessionId, uid);
			return json(result ?? { session: null, turns: [] });
		}
		if (body.conversationListSessions && typeof body.conversationListSessions === 'object') {
			const { userId: uid, limit } = body.conversationListSessions as {
				userId?: string;
				limit?: number;
			};
			if (!uid) return json({ error: 'conversationListSessions requires userId' }, { status: 400 });
			const result = await listSessions(uid, limit);
			return json({ sessions: result });
		}

		return json(
			{
				error:
					'Missing payload: provide speak, quickPhrase, emergency, saveQuickPhrase, loadQuickPhrases, deleteQuickPhrase, loadVoicePreferences, saveVoicePreferences, loadVoiceProfiles, saveVoiceProfile, deleteVoiceProfile, getVoiceProfile, detectLanguage, getVoiceCloneStatus, speakWithClone, deleteVoiceClone, conversationStart, conversationEnd, conversationAddTurn, conversationHistory, or conversationListSessions'
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
