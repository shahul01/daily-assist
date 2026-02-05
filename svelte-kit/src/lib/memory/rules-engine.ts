import { supabaseServer } from '$lib/server/supabase';
import type { LearnedRule } from './types';
import type { Database } from '$lib/types/database.types';

type RuleRow = Database['public']['Tables']['learned_rules']['Row'];

/**
 * Get active learned rules for a user.
 */
export async function getActiveRules(userId: string): Promise<LearnedRule[]> {
	const { data, error } = await supabaseServer
		.from('learned_rules')
		.select('*')
		.eq('user_id', userId)
		.eq('is_active', true)
		.order('confidence', { ascending: false });
	if (error) throw new Error(`Rules getActiveRules failed: ${error.message}`);
	type R = RuleRow;
	return ((data ?? []) as R[]).map((r) => ({
		id: r.id,
		rule_type: r.rule_type,
		pattern: r.pattern,
		confidence: r.confidence,
		data_points: r.data_points,
		examples: (r.examples as unknown[]) ?? [],
		actions: (r.actions as unknown[]) ?? [],
		is_active: r.is_active
	}));
}

/**
 * Store a learned rule (from pattern analysis).
 */
export async function storeRule(
	userId: string,
	rule: {
		rule_type: string;
		pattern: string;
		confidence: number;
		data_points?: number;
		examples?: unknown[];
		actions?: unknown[];
	}
): Promise<void> {
	type LearnedRuleInsert = Database['public']['Tables']['learned_rules']['Insert'];
	const now = new Date().toISOString();
	const row: LearnedRuleInsert = {
		user_id: userId,
		rule_type: rule.rule_type,
		pattern: rule.pattern,
		confidence: rule.confidence,
		data_points: rule.data_points ?? 0,
		examples: (rule.examples as RuleRow['examples']) ?? [],
		actions: (rule.actions as RuleRow['actions']) ?? [],
		is_active: true,
		created_at: now,
		updated_at: now,
		last_applied: null
	};
	// @ts-expect-error Supabase client generic flows as never in this project; payload matches Table insert type
	const { error } = await supabaseServer.from('learned_rules').insert(row);
	if (error) throw new Error(`Rules storeRule failed: ${error.message}`);
}

/**
 * Boost relevance scores of results using learned rules (e.g. preference patterns).
 */
export function boostResults<T extends { similarity?: number; score?: number }>(
	results: T[],
	_rules: LearnedRule[],
	query: string
): T[] {
	// Optional: match rule pattern to query and add small boost to matching results
	const scoreKey = 'similarity' in results[0] ? 'similarity' : 'score';
	return results.map((r) => {
		let boost = 0;
		for (const rule of _rules) {
			if (rule.pattern.toLowerCase().includes(query.toLowerCase().slice(0, 20))) {
				boost += rule.confidence * 0.05;
			}
		}
		const key = scoreKey as keyof T;
		const val = r[key];
		if (typeof val === 'number') {
			return { ...r, [key]: Math.min(1, val + boost) };
		}
		return r;
	});
}
