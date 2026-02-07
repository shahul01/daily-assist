import { supabaseServer } from '$lib/server/supabase';
import type { Database } from '$lib/types/database.types';

const BUCKET = 'generated-media';

type MediaNotificationInsert =
	Database['public']['Tables']['media_deletion_notifications']['Insert'];
type CreateAgentGenerationUpdate =
	Database['public']['Tables']['create_agent_generations']['Update'];
const EXPIRATION_DAYS = 3;
const SIGNED_URL_EXPIRY_SEC = 3600;

export interface UploadGeneratedMediaInput {
	/** Base64-encoded bytes (raw or data URL prefix stripped by caller) */
	bytesBase64: string;
	mimeType: string;
	userId: string;
	type: 'image' | 'video';
	generationId: string;
}

export interface UploadGeneratedMediaResult {
	path: string;
	signedUrl: string;
	expiresAt: Date;
}

/**
 * Upload generated media to Supabase Storage. Path: {userId}/{generationId}.{ext}
 * Caller should set expires_at on create_agent_generations to 3 days from now.
 */
export async function uploadGeneratedMedia(
	input: UploadGeneratedMediaInput
): Promise<UploadGeneratedMediaResult> {
	const { bytesBase64, mimeType, userId, type, generationId } = input;
	const ext = mimeType === 'image/png' ? 'png' : mimeType === 'image/webp' ? 'webp' : 'jpg';
	if (type === 'video') {
		// assume mp4
	}
	const extFinal = type === 'video' ? 'mp4' : ext;
	const path = `${userId}/${generationId}.${extFinal}`;

	const raw = bytesBase64.includes(',') ? bytesBase64.split(',')[1]! : bytesBase64;
	const buf = Buffer.from(raw, 'base64');

	const { error } = await supabaseServer.storage.from(BUCKET).upload(path, buf, {
		contentType: mimeType,
		upsert: true
	});
	if (error) throw new Error(`Storage upload failed: ${error.message}`);

	const expiresAt = new Date();
	expiresAt.setDate(expiresAt.getDate() + EXPIRATION_DAYS);

	const { data: signed } = await supabaseServer.storage
		.from(BUCKET)
		.createSignedUrl(path, SIGNED_URL_EXPIRY_SEC);
	const signedUrl = signed?.signedUrl ?? '';

	return { path, signedUrl, expiresAt };
}

/**
 * Create signed URL for downloading generated media.
 */
export async function getSignedDownloadUrl(path: string): Promise<string> {
	const { data, error } = await supabaseServer.storage
		.from(BUCKET)
		.createSignedUrl(path, SIGNED_URL_EXPIRY_SEC);
	if (error) throw new Error(`Signed URL failed: ${error.message}`);
	if (!data?.signedUrl) throw new Error('No signed URL');
	return data.signedUrl;
}

/**
 * Record that we sent the "3 days before" notification (on creation).
 */
export async function scheduleExpirationNotifications(
	generationId: string,
	_expiresAt: Date
): Promise<void> {
	void _expiresAt;
	const payload: MediaNotificationInsert = {
		generation_id: generationId,
		notification_type: '3_days_before',
		sent_at: new Date().toISOString()
	};
	// Supabase client infers insert as never for this table without generated types
	// eslint-disable-next-line @typescript-eslint/no-explicit-any -- workaround for DB typings
	const { error } = await (supabaseServer.from('media_deletion_notifications') as any).insert(
		payload
	);
	if (error) throw new Error(error.message);
}

/**
 * Delete file from storage and mark generation as deleted.
 */
export async function deleteExpiredMedia(
	generationId: string,
	storagePath: string | null
): Promise<void> {
	if (storagePath) {
		await supabaseServer.storage.from(BUCKET).remove([storagePath]);
	}
	const updatePayload: CreateAgentGenerationUpdate = { deleted: true };
	// eslint-disable-next-line @typescript-eslint/no-explicit-any -- workaround for DB typings
	const { error } = await (supabaseServer.from('create_agent_generations') as any)
		.update(updatePayload)
		.eq('id', generationId);
	if (error) throw new Error(error.message);
}
