/**
 * Tier 3: Voice cloning via ElevenLabs.
 * Requires ELEVENLABS_API_KEY. Graceful no-op when missing.
 */
import { env } from '$env/dynamic/private';
import { supabaseServer } from '$lib/server/supabase';

export interface VoiceCloneStatus {
	userId: string;
	cloneId: string | null;
	provider: string | null;
	trainingStatus: string | null;
	ready: boolean;
}

const ELEVENLABS_TTS_URL = 'https://api.elevenlabs.io/v1/text-to-speech';

function getApiKey(): string | null {
	return env.ELEVENLABS_API_KEY ?? null;
}

/**
 * Get voice clone status for user from DB.
 */
export async function getCloneStatus(userId: string): Promise<VoiceCloneStatus> {
	const { data, error } = await supabaseServer
		.from('voice_clones')
		.select('clone_id, provider, training_status')
		.eq('user_id', userId)
		.single();
	if (error && error.code !== 'PGRST116')
		throw new Error(`Get clone status failed: ${error.message}`);
	const row = data as {
		clone_id: string | null;
		provider: string | null;
		training_status: string | null;
	} | null;
	const status = row?.training_status ?? null;
	const cloneId = row?.clone_id ?? null;
	return {
		userId,
		cloneId,
		provider: row?.provider ?? null,
		trainingStatus: status,
		ready: status === 'ready' && !!cloneId
	};
}

/**
 * Speak with cloned voice (or default ElevenLabs voice). Returns base64 audio or null if API unavailable.
 */
export async function speakWithClone(
	text: string,
	userId: string
): Promise<{ audioBase64: string; contentType: string } | null> {
	const apiKey = getApiKey();
	if (!apiKey) return null;
	const status = await getCloneStatus(userId);
	const voiceId = status.cloneId ?? env.ELEVENLABS_DEFAULT_VOICE_ID ?? '21m00Tcm4TlvDq8ikWAM'; // Rachel default
	const url = `${ELEVENLABS_TTS_URL}/${voiceId}`;
	const res = await fetch(url, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'xi-api-key': apiKey,
			Accept: 'audio/mpeg'
		},
		body: JSON.stringify({
			text: text.slice(0, 5000),
			model_id: 'eleven_monolingual_v1'
		})
	});
	if (!res.ok) {
		console.error('[voice-clone] ElevenLabs TTS failed:', res.status, await res.text());
		return null;
	}
	const buf = await res.arrayBuffer();
	const base64 = Buffer.from(buf).toString('base64');
	const contentType = res.headers.get('Content-Type') ?? 'audio/mpeg';
	return { audioBase64: base64, contentType };
}

/**
 * Delete voice clone record for user (does not delete from ElevenLabs).
 */
export async function deleteVoiceClone(userId: string): Promise<void> {
	const { error } = await supabaseServer.from('voice_clones').delete().eq('user_id', userId);
	if (error) throw new Error(`Delete voice clone failed: ${error.message}`);
}

/**
 * Set or update clone metadata (e.g. after training elsewhere). Idempotent.
 */
export async function setVoiceCloneMetadata(
	userId: string,
	payload: { clone_id?: string; provider?: string; training_status?: string }
): Promise<void> {
	const { error } = await supabaseServer
		.from('voice_clones')
		// @ts-expect-error - voice_clones Upsert type from Database
		.upsert(
			{
				user_id: userId,
				clone_id: payload.clone_id ?? null,
				provider: payload.provider ?? 'elevenlabs',
				training_status: payload.training_status ?? null,
				trained_at: payload.training_status === 'ready' ? new Date().toISOString() : null
			},
			{ onConflict: 'user_id' }
		);
	if (error) throw new Error(`Set voice clone metadata failed: ${error.message}`);
}
