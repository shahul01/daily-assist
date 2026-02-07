import { json } from '@sveltejs/kit';
import { seeAgent, SeeAgentInputSchema } from '$lib/agents/seeAgent';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = (await request.json()) as Record<string, unknown>;
		const preferences = (body.preferences ?? {}) as { voiceMode?: string; detailLevel?: string };
		const payload = {
			cameraFrame: body.cameraFrame,
			mode: body.mode ?? 'full',
			userId: body.userId ?? 'anonymous',
			mimeType: (body.cameraFrameMimeType as string) ?? 'image/jpeg',
			detailLevel: preferences.detailLevel ?? 'brief',
			voiceMode: preferences.voiceMode ?? 'smart'
		};

		const validated = SeeAgentInputSchema.safeParse(payload);
		if (!validated.success) {
			return json(
				{ error: 'Invalid request', details: validated.error.flatten() },
				{ status: 400 }
			);
		}

		const result = await seeAgent.analyzeFrame(validated.data);

		return json({
			analysis: result.analysis,
			shouldSpeak: result.shouldSpeak,
			speechText: result.speechText,
			priority: result.priority
		});
	} catch (error) {
		console.error('See agent API error:', error);
		return json(
			{
				error: 'See agent failed',
				message: error instanceof Error ? error.message : 'Unknown error'
			},
			{ status: 500 }
		);
	}
};
