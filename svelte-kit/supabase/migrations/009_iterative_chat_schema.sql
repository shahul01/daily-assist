-- Iterative chat sessions: plan, execution log, final response (for Usage tab)
-- user_id TEXT to match API/client

CREATE TABLE IF NOT EXISTS public.iterative_chat_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  user_input TEXT NOT NULL,
  plan_json JSONB,
  iterations_count INTEGER NOT NULL DEFAULT 0,
  execution_log_json JSONB,
  final_response TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_iterative_chat_user_time ON public.iterative_chat_sessions(user_id, created_at DESC);
