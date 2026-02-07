import { json } from '@sveltejs/kit';
import { hearAgent, HearAgentInputSchema } from '$lib/agents/hearAgent';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = (await request.json()) as Record<string, unknown>;
		const payload = {
			audioChunk: body.audioChunk,
			mode: body.mode ?? 'full',
			userId: body.userId ?? 'anonymous',
			mimeType: (body.mimeType as string) ?? 'audio/webm',
			clientTranscript: body.clientTranscript as string | undefined
		};

		const validated = HearAgentInputSchema.safeParse(payload);
		if (!validated.success) {
			return json(
				{ error: 'Invalid request', details: validated.error.flatten() },
				{ status: 400 }
			);
		}

		const result = await hearAgent.analyzeAudioChunk(validated.data);

		return json(result);
	} catch (error) {
		console.error('Hear agent API error:', error);
		return json(
			{
				error: 'Hear agent failed',
				message: error instanceof Error ? error.message : 'Unknown error'
			},
			{ status: 500 }
		);
	}
};
