import type { PlannerPlan } from '$lib/agents/orchestrator';

/** Matches ExecutionLog LogEntry shape for restore. */
export interface StoredLogEntry {
	type:
		| 'action'
		| 'iteration_start'
		| 'iteration_complete'
		| 'verification'
		| 'final'
		| 'parallel_start'
		| 'parallel_complete';
	iteration?: number;
	agent?: string;
	action?: string;
	resultSummary?: string;
	message?: string;
	parallelActions?: string;
	status?: 'running' | 'success' | 'error';
	timestamp?: string;
}

export interface StoredConversation {
	id: string;
	userInput: string;
	finalResponse: string | null;
	plan: PlannerPlan | null;
	executionLog: StoredLogEntry[];
	iterationsCount: number;
	agentsUsed: string[];
	createdAt: string;
}

export type SaveConversationInput = Omit<StoredConversation, 'id' | 'createdAt'>;
