import { z } from 'zod';
import { kvGet, kvSet } from '$lib/memory/kv-store';

/** Single emergency contact (stored in user_preferences.emergency_contacts) */
export const EmergencyContactSchema = z.object({
	id: z.string().min(1),
	name: z.string().min(1),
	relationship: z.string(),
	phone: z.string().min(1),
	email: z.string().email().optional(),
	priority: z.number().int().min(1),
	notifyFor: z.array(z.string()).default(['medical'])
});
export type EmergencyContact = z.infer<typeof EmergencyContactSchema>;

/** Stored value: array of contacts */
const EmergencyContactsValueSchema = z.array(EmergencyContactSchema);
const EMERGENCY_CONTACTS_KEY = 'emergency_contacts';

export type GetEmergencyContactsResult = { contacts: EmergencyContact[] };
export type SaveEmergencyContactsInput = { contacts: EmergencyContact[] };
export type SaveEmergencyContactsResult = void;
export type NotifyContext = { reason: string; summary: string; urgent: boolean };

/**
 * Load emergency contacts for a user.
 */
export async function getEmergencyContacts(userId: string): Promise<GetEmergencyContactsResult> {
	const raw = await kvGet(userId, EMERGENCY_CONTACTS_KEY);
	if (raw == null) return { contacts: [] };
	const parsed = EmergencyContactsValueSchema.safeParse(raw);
	if (!parsed.success) return { contacts: [] };
	const contacts = parsed.data.sort((a, b) => a.priority - b.priority);
	return { contacts };
}

/**
 * Save emergency contacts for a user.
 */
export async function saveEmergencyContacts(
	userId: string,
	input: SaveEmergencyContactsInput
): Promise<SaveEmergencyContactsResult> {
	const validated = z.array(EmergencyContactSchema).parse(input.contacts);
	await kvSet(userId, EMERGENCY_CONTACTS_KEY, validated as unknown as Parameters<typeof kvSet>[2]);
}

/**
 * Get contacts to notify for a given context (e.g. medical/medication).
 * Does not send notifications; returns contacts for the caller to display or use.
 */
export async function getContactsToNotify(
	userId: string,
	context: NotifyContext
): Promise<EmergencyContact[]> {
	const { contacts } = await getEmergencyContacts(userId);
	const reason = context.reason.toLowerCase();
	return contacts.filter((c) => c.notifyFor.some((n) => reason.includes(n.toLowerCase())));
}
