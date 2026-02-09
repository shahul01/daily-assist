import { supabaseServer } from '$lib/server/supabase';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '$lib/types/database.types';

export interface TestContext {
	userId: string;
	supabase: SupabaseClient<Database>;
}

/**
 * Whether long-running, real-backend E2E tests should execute.
 * Guarded by environment so normal `pnpm test` stays fast and cheap.
 */
export function shouldRunE2EReal(): boolean {
	return process.env.RUN_E2E_REAL === '1';
}

/**
 * Create a dedicated Supabase auth user for a test run.
 * Uses the service-role client so RLS policies still behave correctly.
 */
export async function createTestUser(): Promise<string> {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const admin = (supabaseServer as any).auth?.admin;
	if (!admin) {
		throw new Error(
			'Supabase admin client is not available. Did you set SUPABASE_SERVICE_ROLE_KEY?'
		);
	}

	const email = `e2e-${Date.now()}-${Math.random().toString(16).slice(2)}@dailyassist.test`;
	const { data, error } = await admin.createUser({
		email,
		email_confirm: true
	});

	if (error || !data?.user?.id) {
		throw new Error(`Failed to create test user: ${error?.message ?? 'no user id returned'}`);
	}

	return data.user.id;
}

/**
 * Best-effort cleanup of a test user. Failures are logged but do not throw,
 * so that tests don't fail during teardown.
 */
export async function deleteTestUser(userId: string): Promise<void> {
	if (!userId) return;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const admin = (supabaseServer as any).auth?.admin;
	if (!admin) return;
	try {
		await admin.deleteUser(userId);
	} catch (error) {
		console.warn('[e2e] deleteTestUser failed:', error);
	}
}

/**
 * Simple helper to wait for asynchronous background work in tests.
 * Prefer small sleeps plus polling over large fixed delays.
 */
export async function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => {
		setTimeout(resolve, ms);
	});
}

export function getSupabaseTestClient(): SupabaseClient<Database> {
	return supabaseServer;
}
