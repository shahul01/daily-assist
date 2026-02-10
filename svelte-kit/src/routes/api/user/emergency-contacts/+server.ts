import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	getEmergencyContacts,
	saveEmergencyContacts,
	EmergencyContactSchema
} from '$lib/utils/emergencyContacts';
import { z } from 'zod';

const SaveBodySchema = z.object({
	userId: z.string().min(1),
	contacts: z.array(EmergencyContactSchema)
});

/**
 * GET: Retrieve user's emergency contacts.
 * Query: userId (required)
 */
export const GET: RequestHandler = async ({ url }) => {
	const userId = url.searchParams.get('userId');
	if (!userId) {
		return json({ error: 'Missing userId' }, { status: 400 });
	}
	try {
		const result = await getEmergencyContacts(userId);
		return json(result);
	} catch (error) {
		console.error('Emergency contacts GET error:', error);
		return json(
			{
				error: 'Failed to get emergency contacts',
				message: error instanceof Error ? error.message : 'Unknown error'
			},
			{ status: 500 }
		);
	}
};

/**
 * POST: Save or replace user's emergency contacts.
 * Body: { userId: string, contacts: EmergencyContact[] }
 */
export const POST: RequestHandler = async ({ request }) => {
	if (request.headers.get('content-type')?.includes('application/json') !== true) {
		return json({ error: 'Content-Type must be application/json' }, { status: 400 });
	}
	try {
		const body = await request.json();
		const parsed = SaveBodySchema.safeParse(body);
		if (!parsed.success) {
			return json({ error: 'Invalid body', details: parsed.error.flatten() }, { status: 400 });
		}
		await saveEmergencyContacts(parsed.data.userId, { contacts: parsed.data.contacts });
		return json({ ok: true });
	} catch (error) {
		console.error('Emergency contacts POST error:', error);
		return json(
			{
				error: 'Failed to save emergency contacts',
				message: error instanceof Error ? error.message : 'Unknown error'
			},
			{ status: 500 }
		);
	}
};

const DeleteBodySchema = z.object({
	userId: z.string().min(1),
	contactId: z.string().min(1)
});

/**
 * DELETE: Remove one emergency contact by id.
 * Body: { userId: string, contactId: string }
 */
export const DELETE: RequestHandler = async ({ request }) => {
	if (request.headers.get('content-type')?.includes('application/json') !== true) {
		return json({ error: 'Content-Type must be application/json' }, { status: 400 });
	}
	try {
		const body = await request.json();
		const parsed = DeleteBodySchema.safeParse(body);
		if (!parsed.success) {
			return json({ error: 'Invalid body', details: parsed.error.flatten() }, { status: 400 });
		}
		const { contacts } = await getEmergencyContacts(parsed.data.userId);
		const filtered = contacts.filter((c) => c.id !== parsed.data.contactId);
		await saveEmergencyContacts(parsed.data.userId, { contacts: filtered });
		return json({ ok: true });
	} catch (error) {
		console.error('Emergency contacts DELETE error:', error);
		return json(
			{
				error: 'Failed to delete emergency contact',
				message: error instanceof Error ? error.message : 'Unknown error'
			},
			{ status: 500 }
		);
	}
};
