/**
 * Supabase database types for hybrid memory schema.
 * Regenerate after schema changes: pnpm supabase:types
 */
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type MemoryTypeEnum = 'preference' | 'goal' | 'todo' | 'event' | 'fact';

export interface Database {
	public: {
		Tables: {
			memories: {
				Row: {
					id: string;
					user_id: string;
					memory_type: MemoryTypeEnum;
					category: string | null;
					text_content: string;
					summary: string | null;
					embedding: number[] | null;
					created_at: string;
					updated_at: string;
					last_accessed: string | null;
					valid_until: string | null;
					access_count: number;
					mention_count: number;
					relevance_score: number;
					confidence: number;
					extraction_source: string | null;
					context_tags: Json;
					is_active: boolean;
					is_validated: boolean;
				};
				Insert: {
					id?: string;
					user_id: string;
					memory_type: MemoryTypeEnum;
					category?: string | null;
					text_content: string;
					summary?: string | null;
					embedding?: number[] | null;
					created_at?: string;
					updated_at?: string;
					last_accessed?: string | null;
					valid_until?: string | null;
					access_count?: number;
					mention_count?: number;
					relevance_score?: number;
					confidence?: number;
					extraction_source?: string | null;
					context_tags?: Json;
					is_active?: boolean;
					is_validated?: boolean;
				};
				Update: {
					id?: string;
					user_id?: string;
					memory_type?: MemoryTypeEnum;
					category?: string | null;
					text_content?: string;
					summary?: string | null;
					embedding?: number[] | null;
					created_at?: string;
					updated_at?: string;
					last_accessed?: string | null;
					valid_until?: string | null;
					access_count?: number;
					mention_count?: number;
					relevance_score?: number;
					confidence?: number;
					extraction_source?: string | null;
					context_tags?: Json;
					is_active?: boolean;
					is_validated?: boolean;
				};
			};
			memory_relationships: {
				Row: {
					id: string;
					from_memory_id: string;
					to_memory_id: string;
					relationship_type: string;
					strength: number;
					created_at: string;
					last_referenced: string | null;
					reference_count: number;
					context: string | null;
				};
				Insert: {
					id?: string;
					from_memory_id: string;
					to_memory_id: string;
					relationship_type: string;
					strength?: number;
					created_at?: string;
					last_referenced?: string | null;
					reference_count?: number;
					context?: string | null;
				};
				Update: Partial<Database['public']['Tables']['memory_relationships']['Insert']>;
			};
			user_preferences: {
				Row: {
					user_id: string;
					key: string;
					value: Json;
					created_at: string;
					updated_at: string;
					access_count: number;
				};
				Insert: {
					user_id: string;
					key: string;
					value: Json;
					created_at?: string;
					updated_at?: string;
					access_count?: number;
				};
				Update: {
					user_id?: string;
					key?: string;
					value?: Json;
					created_at?: string;
					updated_at?: string;
					access_count?: number;
				};
			};
			goals: {
				Row: {
					id: string;
					user_id: string;
					memory_id: string | null;
					title: string;
					description: string | null;
					status: string;
					priority: string | null;
					created_at: string;
					updated_at: string;
					deadline: string | null;
					completed_at: string | null;
					progress: number;
				};
				Insert: Omit<Database['public']['Tables']['goals']['Row'], 'id'> & { id?: string };
				Update: Partial<Database['public']['Tables']['goals']['Insert']>;
			};
			todos: {
				Row: {
					id: string;
					user_id: string;
					memory_id: string | null;
					goal_id: string | null;
					task: string;
					description: string | null;
					completed: boolean;
					created_at: string;
					updated_at: string;
					due_date: string | null;
					completed_at: string | null;
					priority: string | null;
					estimated_hours: number | null;
					tags: Json;
				};
				Insert: Omit<Database['public']['Tables']['todos']['Row'], 'id'> & { id?: string };
				Update: Partial<Database['public']['Tables']['todos']['Insert']>;
			};
			events: {
				Row: {
					id: string;
					user_id: string;
					memory_id: string | null;
					title: string;
					description: string | null;
					event_type: string | null;
					timestamp: string;
					impact_score: number | null;
					context: Json;
				};
				Insert: Omit<Database['public']['Tables']['events']['Row'], 'id'> & { id?: string };
				Update: Partial<Database['public']['Tables']['events']['Insert']>;
			};
			learned_rules: {
				Row: {
					id: string;
					user_id: string;
					rule_type: string;
					pattern: string;
					confidence: number;
					data_points: number;
					examples: Json;
					actions: Json;
					is_active: boolean;
					created_at: string;
					updated_at: string;
					last_applied: string | null;
				};
				Insert: Omit<Database['public']['Tables']['learned_rules']['Row'], 'id'> & { id?: string };
				Update: Partial<Database['public']['Tables']['learned_rules']['Insert']>;
			};
			frequency_tracking: {
				Row: {
					user_id: string;
					entity_type: string;
					entity_value: string;
					count: number;
					first_seen: string;
					last_seen: string;
					contexts: Json;
				};
				Insert: {
					user_id: string;
					entity_type: string;
					entity_value: string;
					count?: number;
					first_seen?: string;
					last_seen?: string;
					contexts?: Json;
				};
				Update: Partial<Database['public']['Tables']['frequency_tracking']['Insert']>;
			};
		};
		Functions: {
			match_memories: {
				Args: {
					query_embedding: number[];
					match_user_id: string;
					match_threshold?: number;
					match_count?: number;
					filter_type?: MemoryTypeEnum | null;
				};
				Returns: {
					id: string;
					text_content: string;
					memory_type: MemoryTypeEnum;
					category: string | null;
					relevance_score: number;
					similarity: number;
				}[];
			};
		};
	};
}

export type Tables<T extends keyof Database['public']['Tables']> =
	Database['public']['Tables'][T]['Row'];
export type Enums = { memory_type_enum: MemoryTypeEnum };
