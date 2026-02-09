/**
 * Supabase database types for hybrid memory schema.
 * Regenerate after schema changes: pnpm supabase:types
 */
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type MemoryTypeEnum = 'preference' | 'goal' | 'todo' | 'event' | 'fact';

export interface Database {
	__InternalSupabase: { PostgrestVersion: '14.1' };
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
			marathon_sessions: {
				Row: {
					id: string;
					user_id: string;
					status: string;
					mode: string;
					started_at: string;
					ended_at: string | null;
					duration_hours: number | null;
					last_activity_at: string;
					config: Json;
					metadata: Json;
					created_at: string;
					updated_at: string;
				};
				Insert: {
					id?: string;
					user_id: string;
					status?: string;
					mode?: string;
					started_at?: string;
					ended_at?: string | null;
					duration_hours?: number | null;
					last_activity_at?: string;
					config?: Json;
					metadata?: Json;
					created_at?: string;
					updated_at?: string;
				};
				Update: Partial<Database['public']['Tables']['marathon_sessions']['Insert']>;
			};
			thought_signatures: {
				Row: {
					id: string;
					user_id: string;
					marathon_session_id: string | null;
					signature: string;
					context: string | null;
					agent_used: string | null;
					task_completed: boolean;
					created_at: string;
				};
				Insert: {
					id?: string;
					user_id: string;
					marathon_session_id?: string | null;
					signature: string;
					context?: string | null;
					agent_used?: string | null;
					task_completed?: boolean;
					created_at?: string;
				};
				Update: Partial<Database['public']['Tables']['thought_signatures']['Insert']>;
			};
			marathon_actions: {
				Row: {
					id: string;
					marathon_session_id: string;
					user_id: string;
					action_type: string;
					agent_name: string;
					action_payload: Json;
					result: Json | null;
					thought_signature_id: string | null;
					success: boolean;
					retry_count: number;
					verification_passed: boolean | null;
					error_message: string | null;
					created_at: string;
				};
				Insert: {
					id?: string;
					marathon_session_id: string;
					user_id: string;
					action_type: string;
					agent_name: string;
					action_payload?: Json;
					result?: Json | null;
					thought_signature_id?: string | null;
					success?: boolean;
					retry_count?: number;
					verification_passed?: boolean | null;
					error_message?: string | null;
					created_at?: string;
				};
				Update: Partial<Database['public']['Tables']['marathon_actions']['Insert']>;
			};
			iterative_chat_sessions: {
				Row: {
					id: string;
					user_id: string;
					user_input: string;
					plan_json: Json | null;
					iterations_count: number;
					execution_log_json: Json | null;
					final_response: string | null;
					created_at: string;
				};
				Insert: {
					id?: string;
					user_id: string;
					user_input: string;
					plan_json?: Json | null;
					iterations_count?: number;
					execution_log_json?: Json | null;
					final_response?: string | null;
					created_at?: string;
				};
				Update: Partial<Database['public']['Tables']['iterative_chat_sessions']['Insert']>;
			};
			agent_executions: {
				Row: {
					id: string;
					marathon_action_id: string;
					attempt_number: number;
					agent_name: string;
					input_snapshot: Json | null;
					output_snapshot: Json | null;
					success: boolean;
					error_message: string | null;
					duration_ms: number | null;
					created_at: string;
				};
				Insert: {
					id?: string;
					marathon_action_id: string;
					attempt_number?: number;
					agent_name: string;
					input_snapshot?: Json | null;
					output_snapshot?: Json | null;
					success?: boolean;
					error_message?: string | null;
					duration_ms?: number | null;
					created_at?: string;
				};
				Update: Partial<Database['public']['Tables']['agent_executions']['Insert']>;
			};
			marathon_checkpoints: {
				Row: {
					id: string;
					marathon_session_id: string;
					sequence_number: number;
					full_state: Json | null;
					thought_signature_ids: string[] | null;
					last_action_id: string | null;
					created_at: string;
				};
				Insert: {
					id?: string;
					marathon_session_id: string;
					sequence_number: number;
					full_state?: Json | null;
					thought_signature_ids?: string[] | null;
					last_action_id?: string | null;
					created_at?: string;
				};
				Update: Partial<Database['public']['Tables']['marathon_checkpoints']['Insert']>;
			};
			drafts: {
				Row: {
					id: string;
					user_id: string;
					title: string | null;
					content: string;
					draft_type: string | null;
					metadata: Json;
					created_at: string;
					updated_at: string;
					version: number;
				};
				Insert: {
					id?: string;
					user_id: string;
					title?: string | null;
					content: string;
					draft_type?: string | null;
					metadata?: Json;
					created_at?: string;
					updated_at?: string;
					version?: number;
				};
				Update: Partial<Database['public']['Tables']['drafts']['Insert']>;
			};
			writing_templates: {
				Row: {
					id: string;
					user_id: string | null;
					name: string;
					description: string | null;
					template_type: string;
					content: string;
					variables: Json;
					usage_count: number;
					is_public: boolean;
					created_at: string;
					updated_at: string;
				};
				Insert: {
					id?: string;
					user_id?: string | null;
					name: string;
					description?: string | null;
					template_type: string;
					content: string;
					variables?: Json;
					usage_count?: number;
					is_public?: boolean;
					created_at?: string;
					updated_at?: string;
				};
				Update: Partial<Database['public']['Tables']['writing_templates']['Insert']>;
			};
			style_profiles: {
				Row: {
					id: string;
					user_id: string;
					vocabulary_preferences: Json;
					sentence_patterns: Json;
					common_phrases: string[];
					tone_preference: string | null;
					formality_level: number | null;
					sample_count: number;
					confidence_score: number;
					last_updated: string;
				};
				Insert: {
					id?: string;
					user_id: string;
					vocabulary_preferences?: Json;
					sentence_patterns?: Json;
					common_phrases?: string[];
					tone_preference?: string | null;
					formality_level?: number | null;
					sample_count?: number;
					confidence_score?: number;
					last_updated?: string;
				};
				Update: Partial<Database['public']['Tables']['style_profiles']['Insert']>;
			};
			draft_history: {
				Row: {
					id: string;
					draft_id: string;
					version: number;
					content: string;
					change_summary: string | null;
					created_at: string;
				};
				Insert: {
					id?: string;
					draft_id: string;
					version: number;
					content: string;
					change_summary?: string | null;
					created_at?: string;
				};
				Update: Partial<Database['public']['Tables']['draft_history']['Insert']>;
			};
			quick_phrases: {
				Row: {
					id: string;
					user_id: string;
					phrase: string;
					category: string | null;
					emotion: string | null;
					language: string | null;
					is_default: boolean;
					usage_count: number;
					created_at: string;
					updated_at: string;
				};
				Insert: {
					id?: string;
					user_id: string;
					phrase: string;
					category?: string | null;
					emotion?: string | null;
					language?: string | null;
					is_default?: boolean;
					usage_count?: number;
					created_at?: string;
					updated_at?: string;
				};
				Update: Partial<Database['public']['Tables']['quick_phrases']['Insert']>;
			};
			voice_preferences: {
				Row: {
					user_id: string;
					pitch: number;
					rate: number;
					volume: number;
					language: string;
					voice_uri: string | null;
					emergency_volume: number;
					emergency_rate: number;
					updated_at: string;
				};
				Insert: {
					user_id: string;
					pitch?: number;
					rate?: number;
					volume?: number;
					language?: string;
					voice_uri?: string | null;
					emergency_volume?: number;
					emergency_rate?: number;
					updated_at?: string;
				};
				Update: Partial<Database['public']['Tables']['voice_preferences']['Insert']>;
			};
			voice_profiles: {
				Row: {
					id: string;
					user_id: string;
					name: string;
					pitch: number;
					rate: number;
					volume: number;
					language: string;
					voice_uri: string | null;
					is_active: boolean;
					created_at: string;
				};
				Insert: {
					id?: string;
					user_id: string;
					name: string;
					pitch?: number;
					rate?: number;
					volume?: number;
					language?: string;
					voice_uri?: string | null;
					is_active?: boolean;
					created_at?: string;
				};
				Update: Partial<Database['public']['Tables']['voice_profiles']['Insert']>;
			};
			voice_clones: {
				Row: {
					user_id: string;
					clone_id: string | null;
					provider: string | null;
					sample_duration_seconds: number | null;
					training_status: string | null;
					created_at: string;
					trained_at: string | null;
				};
				Insert: {
					user_id: string;
					clone_id?: string | null;
					provider?: string | null;
					sample_duration_seconds?: number | null;
					training_status?: string | null;
					created_at?: string;
					trained_at?: string | null;
				};
				Update: Partial<Database['public']['Tables']['voice_clones']['Insert']>;
			};
			conversation_sessions: {
				Row: {
					id: string;
					user_id: string;
					started_at: string;
					ended_at: string | null;
					duration_seconds: number | null;
					turn_count: number;
					summary: string | null;
					created_at: string;
				};
				Insert: {
					id?: string;
					user_id: string;
					started_at?: string;
					ended_at?: string | null;
					duration_seconds?: number | null;
					turn_count?: number;
					summary?: string | null;
					created_at?: string;
				};
				Update: Partial<Database['public']['Tables']['conversation_sessions']['Insert']>;
			};
			conversation_turns: {
				Row: {
					id: string;
					session_id: string;
					turn_number: number;
					speaker: string;
					text: string | null;
					audio_url: string | null;
					emotion: string | null;
					created_at: string;
				};
				Insert: {
					id?: string;
					session_id: string;
					turn_number: number;
					speaker: string;
					text?: string | null;
					audio_url?: string | null;
					emotion?: string | null;
					created_at?: string;
				};
				Update: Partial<Database['public']['Tables']['conversation_turns']['Insert']>;
			};
			medications: {
				Row: {
					id: string;
					user_id: string;
					name: string;
					dosage: string | null;
					schedule_times: Json;
					frequency: string | null;
					start_date: string | null;
					end_date: string | null;
					is_active: boolean;
					notes: string | null;
					is_critical: boolean;
					created_at: string;
					updated_at: string;
				};
				Insert: {
					id?: string;
					user_id: string;
					name: string;
					dosage?: string | null;
					schedule_times?: Json;
					frequency?: string | null;
					start_date?: string | null;
					end_date?: string | null;
					is_active?: boolean;
					notes?: string | null;
					is_critical?: boolean;
					created_at?: string;
					updated_at?: string;
				};
				Update: Partial<Database['public']['Tables']['medications']['Insert']>;
			};
			medication_logs: {
				Row: {
					id: string;
					medication_id: string;
					user_id: string;
					scheduled_time: string;
					taken_at: string | null;
					status: string;
					notes: string | null;
					created_at: string;
				};
				Insert: {
					id?: string;
					medication_id: string;
					user_id: string;
					scheduled_time: string;
					taken_at?: string | null;
					status: string;
					notes?: string | null;
					created_at?: string;
				};
				Update: Partial<Database['public']['Tables']['medication_logs']['Insert']>;
			};
			appointments: {
				Row: {
					id: string;
					user_id: string;
					title: string;
					description: string | null;
					appointment_time: string;
					duration_minutes: number | null;
					location: string | null;
					appointment_type: string | null;
					reminder_minutes_before: number[] | null;
					status: string;
					created_at: string;
					updated_at: string;
				};
				Insert: {
					id?: string;
					user_id: string;
					title: string;
					description?: string | null;
					appointment_time: string;
					duration_minutes?: number | null;
					location?: string | null;
					appointment_type?: string | null;
					reminder_minutes_before?: number[] | null;
					status?: string;
					created_at?: string;
					updated_at?: string;
				};
				Update: Partial<Database['public']['Tables']['appointments']['Insert']>;
			};
			escalations: {
				Row: {
					id: string;
					user_id: string;
					reminder_id: string | null;
					medication_id: string | null;
					appointment_id: string | null;
					escalation_type: string;
					severity: string;
					status: string;
					triggered_at: string;
					resolved_at: string | null;
					contact_method: string | null;
					contact_info: string | null;
					message: string | null;
					created_at: string;
				};
				Insert: {
					id?: string;
					user_id: string;
					reminder_id?: string | null;
					medication_id?: string | null;
					appointment_id?: string | null;
					escalation_type: string;
					severity: string;
					status?: string;
					triggered_at?: string;
					resolved_at?: string | null;
					contact_method?: string | null;
					contact_info?: string | null;
					message?: string | null;
					created_at?: string;
				};
				Update: Partial<Database['public']['Tables']['escalations']['Insert']>;
			};
			pattern_analysis: {
				Row: {
					id: string;
					user_id: string;
					pattern_type: string;
					pattern_data: Json;
					confidence_score: number;
					detected_at: string;
					occurrences_count: number;
					last_occurrence: string | null;
					suggestion: string | null;
					is_active: boolean;
					created_at: string;
					updated_at: string;
				};
				Insert: {
					id?: string;
					user_id: string;
					pattern_type: string;
					pattern_data?: Json;
					confidence_score?: number;
					detected_at?: string;
					occurrences_count?: number;
					last_occurrence?: string | null;
					suggestion?: string | null;
					is_active?: boolean;
					created_at?: string;
					updated_at?: string;
				};
				Update: Partial<Database['public']['Tables']['pattern_analysis']['Insert']>;
			};
			character_profiles: {
				Row: {
					id: string;
					user_id: string;
					name: string;
					description: string | null;
					reference_images: Json;
					created_at: string;
				};
				Insert: {
					id?: string;
					user_id: string;
					name: string;
					description?: string | null;
					reference_images?: Json;
					created_at?: string;
				};
				Update: {
					id?: string;
					user_id?: string;
					name?: string;
					description?: string | null;
					reference_images?: Json;
					created_at?: string;
				};
				Relationships: [];
			};
			create_agent_generations: {
				Row: {
					id: string;
					user_id: string;
					type: string;
					prompt: string;
					model: string;
					result_storage_path: string | null;
					result_mime_type: string | null;
					metadata: Json | null;
					character_profile_id: string | null;
					expires_at: string | null;
					deleted: boolean;
					created_at: string;
				};
				Insert: {
					id?: string;
					user_id: string;
					type: string;
					prompt: string;
					model: string;
					result_storage_path?: string | null;
					result_mime_type?: string | null;
					metadata?: Json | null;
					character_profile_id?: string | null;
					expires_at?: string | null;
					deleted?: boolean;
					created_at?: string;
				};
				Update: {
					id?: string;
					user_id?: string;
					type?: string;
					prompt?: string;
					model?: string;
					result_storage_path?: string | null;
					result_mime_type?: string | null;
					metadata?: Json | null;
					character_profile_id?: string | null;
					expires_at?: string | null;
					deleted?: boolean;
					created_at?: string;
				};
				Relationships: [];
			};
			media_deletion_notifications: {
				Row: {
					id: string;
					generation_id: string;
					notification_type: string;
					sent_at: string | null;
					created_at: string;
				};
				Insert: {
					id?: string;
					generation_id: string;
					notification_type: string;
					sent_at?: string | null;
					created_at?: string;
				};
				Update: {
					id?: string;
					generation_id?: string;
					notification_type?: string;
					sent_at?: string | null;
					created_at?: string;
				};
				Relationships: [];
			};
			agent_usage_log: {
				Row: {
					id: string;
					user_id: string;
					agent_name: string;
					created_at: string;
				};
				Insert: {
					id?: string;
					user_id: string;
					agent_name: string;
					created_at?: string;
				};
				Update: {
					id?: string;
					user_id?: string;
					agent_name?: string;
					created_at?: string;
				};
				Relationships: [];
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
			prune_old_marathon_data: {
				Args: Record<string, never>;
				Returns: void;
			};
		};
	};
}

export type Tables<T extends keyof Database['public']['Tables']> =
	Database['public']['Tables'][T]['Row'];
export type Enums = { memory_type_enum: MemoryTypeEnum };
