import { json } from '@sveltejs/kit';
import { MarathonConfigSchema, marathonOrchestrator } from '$lib/agents/marathonOrchestrator';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = await request.json();
		const userId = body?.userId;
		if (!userId || typeof userId !== 'string') {
			return json({ error: 'Missing or invalid userId' }, { status: 400 });
		}

		const config = MarathonConfigSchema.parse({
			userId,
			durationHours: body.durationHours ?? 24,
			mode: body.mode ?? 'hybrid',
			observeIntervalSeconds: body.observeIntervalSeconds ?? 60,
			checkpointEveryNActions: body.checkpointEveryNActions ?? 10,
			maxRetriesPerAction: body.maxRetriesPerAction ?? 3
		});

		// Run marathon in background; do not await
		marathonOrchestrator.runMarathon(config).catch((err) => {
			console.error('[marathon] runMarathon error', err);
		});

		return json({
			started: true,
			message: 'Marathon session started in background. Use GET /api/marathon/status?userId=... to check status.'
		});
	} catch (error) {
		console.error('Marathon start API error:', error);
		return json(
			{
				error: 'Failed to start marathon',
				message: error instanceof Error ? error.message : 'Unknown error'
			},
			{ status: 500 }
		);
	}
};
