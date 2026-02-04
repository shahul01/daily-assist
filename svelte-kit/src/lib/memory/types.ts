import type { MemoryTypeEnum } from '$lib/types/database.types';

export type { MemoryTypeEnum };

export interface ExtractedMemory {
	type: MemoryTypeEnum;
	text: string;
	confidence: number;
	category?: string;
	key?: string;
	value?: string;
	title?: string;
	metadata?: Record<string, unknown>;
	relationships?: Array<{
		type: string;
		targetType?: string;
		targetDescription?: string;
		targetId?: string;
		strength?: number;
		context?: string;
	}>;
	context?: Record<string, unknown>;
}

export interface MemoryWithScore {
	id: string;
	text_content: string;
	memory_type: MemoryTypeEnum;
	category: string | null;
	relevance_score: number;
	similarity: number;
}

export interface RetrieveOptions {
	limit?: number;
	includeRelated?: boolean;
	timeWindowMs?: number;
	types?: MemoryTypeEnum[];
}

export interface LearnedRule {
	id: string;
	rule_type: string;
	pattern: string;
	confidence: number;
	data_points: number;
	examples: unknown[];
	actions: unknown[];
	is_active: boolean;
}

export type RelationshipType =
	| 'REQUIRES'
	| 'SUPPORTS'
	| 'RELATES_TO'
	| 'CONFLICTS_WITH'
	| 'FOLLOWS'
	| 'INFLUENCES'
	| 'DEPENDS_ON';
