import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { rememberAgent } from '$lib/agents/rememberAgent';

export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = await request.json();

		if (!body.userId) {
			return json({ error: 'Missing userId' }, { status: 400 });
		}

		// Create reminder
		if (body.action === 'create_reminder') {
			const result = await rememberAgent.createReminder({
				action: 'create_reminder',
				task: body.task,
				time: body.time,
				userId: body.userId,
				context: body.context
			});
			return json(result);
		}

		// List reminders
		if (body.action === 'list_reminders') {
			const result = await rememberAgent.listReminders(body.userId);
			return json({ reminders: result });
		}

		// Analyze patterns
		if (body.action === 'analyze_patterns') {
			const result = await rememberAgent.analyzePatterns(
				body.userId,
				body.conversationHistory || []
			);
			return json({ analysis: result });
		}

		return json({ error: 'Invalid action' }, { status: 400 });
	} catch (error) {
		console.error('Remember agent API error:', error);
		return json(
			{
				error: 'Remember agent failed',
				message: error instanceof Error ? error.message : 'Unknown error'
			},
			{ status: 500 }
		);
	}
};