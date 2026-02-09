export interface UsageStatsResponse {
	overall: {
		totalSessions: number;
		totalActions: number;
		activeAgentsCount: number;
		totalMemories: number;
	};
	marathon: {
		sessionCount: number;
		avgDurationHours: number;
		successRate: number;
		topAgents: Array<{ name: string; executionCount: number }>;
		recentSessions: Array<{
			id: string;
			status: string;
			mode: string;
			started_at: string;
			duration_hours: number | null;
		}>;
	};
	conversations: {
		sessionCount: number;
		totalTurns: number;
		avgTurnsPerSession: number;
		avgDurationSeconds: number;
		recentSessions: Array<{
			id: string;
			started_at: string;
			turn_count: number;
			duration_seconds: number | null;
		}>;
	};
	agentUsage: Array<{
		agentName: string;
		totalActions: number;
		successRate: number;
		lastUsed: string | null;
		specificMetric?: number;
	}>;
	timeline: Array<{
		date: string;
		sessionCount: number;
		actionCount: number;
	}>;
}
