import { supabaseServer } from '$lib/server/supabase';
import type { Json } from '$lib/types/database.types';

/**
 * Key-value store using user_preferences table. Key format: any string (e.g. "timezone", "pref:language").
 */
export async function kvGet(userId: string, key: string): Promise<Json | null> {
	const { data, error } = await supabaseServer
		.from('user_preferences')
		.select('value')
		.eq('user_id', userId)
		.eq('key', key)
		.maybeSingle();
	if (error) throw new Error(`KV get failed: ${error.message}`);
	return (data as { value?: Json } | null)?.value ?? null;
}

export async function kvSet(userId: string, key: string, value: Json): Promise<void> {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const { error } = await supabaseServer.from('user_preferences').upsert(
		{
			user_id: userId,
			key,
			value,
			updated_at: new Date().toISOString()
		} as any,
		{ onConflict: 'user_id,key' }
	);
	if (error) throw new Error(`KV set failed: ${error.message}`);
}

export async function kvGetAll(userId: string, keyPrefix?: string): Promise<Record<string, Json>> {
	let q = supabaseServer.from('user_preferences').select('key, value').eq('user_id', userId);
	if (keyPrefix) {
		q = q.like('key', `${keyPrefix.replace(/%/g, '\\%')}%`);
	}
	const { data, error } = await q;
	if (error) throw new Error(`KV getAll failed: ${error.message}`);
	const out: Record<string, Json> = {};
	for (const row of (data ?? []) as Array<{ key: string; value: Json }>) {
		out[row.key] = row.value;
	}
	return out;
}

export async function kvDelete(userId: string, key: string): Promise<void> {
	const { error } = await supabaseServer.from('user_preferences').delete().eq('user_id', userId).eq('key', key);
	if (error) throw new Error(`KV delete failed: ${error.message}`);
}
