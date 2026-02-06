-- Marathon Orchestrator Schema for DailyAssist
-- Tracks long-running sessions, actions, checkpoints; 14-day pruning.

-- Session status for marathon runs
CREATE TYPE marathon_session_status AS ENUM ('running', 'paused', 'stopped', 'completed', 'failed');

-- Marathon sessions: one per user per long-running orchestration
CREATE TABLE IF NOT EXISTS public.marathon_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  status marathon_session_status NOT NULL DEFAULT 'running',
  mode TEXT NOT NULL DEFAULT 'hybrid' CHECK (mode IN ('on_demand', 'background', 'hybrid')),

  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  duration_hours INTEGER,
  last_activity_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  config JSONB DEFAULT '{}',
  metadata JSONB DEFAULT '{}',

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_marathon_sessions_user ON public.marathon_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_marathon_sessions_status ON public.marathon_sessions(status);
CREATE INDEX IF NOT EXISTS idx_marathon_sessions_started ON public.marathon_sessions(started_at DESC);

-- Thought signatures: persist reasoning continuity across sessions
CREATE TABLE IF NOT EXISTS public.thought_signatures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  marathon_session_id UUID REFERENCES public.marathon_sessions(id) ON DELETE SET NULL,

  signature TEXT NOT NULL,
  context TEXT,
  agent_used TEXT,
  task_completed BOOLEAN NOT NULL DEFAULT false,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_thought_signatures_user ON public.thought_signatures(user_id);
CREATE INDEX IF NOT EXISTS idx_thought_signatures_session ON public.thought_signatures(marathon_session_id);
CREATE INDEX IF NOT EXISTS idx_thought_signatures_created ON public.thought_signatures(created_at DESC);

-- Marathon actions: full audit trail of orchestrator actions
CREATE TABLE IF NOT EXISTS public.marathon_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  marathon_session_id UUID NOT NULL REFERENCES public.marathon_sessions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  action_type TEXT NOT NULL,
  agent_name TEXT NOT NULL,
  action_payload JSONB DEFAULT '{}',
  result JSONB,
  thought_signature_id UUID REFERENCES public.thought_signatures(id) ON DELETE SET NULL,

  success BOOLEAN NOT NULL DEFAULT false,
  retry_count INTEGER NOT NULL DEFAULT 0,
  verification_passed BOOLEAN,
  error_message TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_marathon_actions_session ON public.marathon_actions(marathon_session_id);
CREATE INDEX IF NOT EXISTS idx_marathon_actions_user ON public.marathon_actions(user_id);
CREATE INDEX IF NOT EXISTS idx_marathon_actions_created ON public.marathon_actions(created_at DESC);

-- Agent executions: detailed execution logs with retry history
CREATE TABLE IF NOT EXISTS public.agent_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  marathon_action_id UUID NOT NULL REFERENCES public.marathon_actions(id) ON DELETE CASCADE,

  attempt_number INTEGER NOT NULL DEFAULT 1,
  agent_name TEXT NOT NULL,
  input_snapshot JSONB,
  output_snapshot JSONB,
  success BOOLEAN NOT NULL DEFAULT false,
  error_message TEXT,
  duration_ms INTEGER,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_executions_action ON public.agent_executions(marathon_action_id);

-- Marathon checkpoints: state for recovery after crash/restart
CREATE TABLE IF NOT EXISTS public.marathon_checkpoints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  marathon_session_id UUID NOT NULL REFERENCES public.marathon_sessions(id) ON DELETE CASCADE,

  sequence_number INTEGER NOT NULL,
  full_state JSONB,
  thought_signature_ids UUID[],
  last_action_id UUID REFERENCES public.marathon_actions(id) ON DELETE SET NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_marathon_checkpoints_session_seq
  ON public.marathon_checkpoints(marathon_session_id, sequence_number);
CREATE INDEX IF NOT EXISTS idx_marathon_checkpoints_created ON public.marathon_checkpoints(created_at DESC);

-- RLS
ALTER TABLE public.marathon_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.thought_signatures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marathon_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_executions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marathon_checkpoints ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own marathon_sessions" ON public.marathon_sessions
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can manage own thought_signatures" ON public.thought_signatures
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can manage own marathon_actions" ON public.marathon_actions
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can read agent_executions via own actions" ON public.agent_executions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.marathon_actions a
      WHERE a.id = agent_executions.marathon_action_id AND a.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert agent_executions for own actions" ON public.agent_executions
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.marathon_actions a
      WHERE a.id = agent_executions.marathon_action_id AND a.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can manage own marathon_checkpoints" ON public.marathon_checkpoints
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.marathon_sessions s
      WHERE s.id = marathon_checkpoints.marathon_session_id AND s.user_id = auth.uid()
    )
  );

-- Trigger: updated_at for marathon_sessions
CREATE TRIGGER marathon_sessions_updated_at
  BEFORE UPDATE ON public.marathon_sessions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Prune old marathon data after 14 days; keep thought signatures
CREATE OR REPLACE FUNCTION public.prune_old_marathon_data()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.marathon_actions
  WHERE created_at < NOW() - INTERVAL '14 days';

  UPDATE public.marathon_checkpoints
  SET full_state = NULL
  WHERE created_at < NOW() - INTERVAL '14 days';

  DELETE FROM public.marathon_checkpoints
  WHERE created_at < NOW() - INTERVAL '90 days';

  DELETE FROM public.thought_signatures
  WHERE created_at < NOW() - INTERVAL '90 days';
END;
$$;
