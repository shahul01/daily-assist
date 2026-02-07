-- See-For-Me Agent: vision analysis logs, danger history, user preferences
-- user_id is TEXT to match API/client (can reference auth.users(id)::text if needed)

-- Vision analysis logs (optional: for analytics and caching)
CREATE TABLE IF NOT EXISTS public.see_agent_analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  analysis JSONB NOT NULL,
  frame_timestamp TIMESTAMPTZ NOT NULL,
  dangers_detected INTEGER DEFAULT 0,
  objects_detected INTEGER DEFAULT 0,
  text_detected INTEGER DEFAULT 0,
  processing_time_ms INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_see_analyses_user_time ON public.see_agent_analyses(user_id, created_at DESC);

-- Danger detection history (for escalation and auditing)
CREATE TABLE IF NOT EXISTS public.see_agent_dangers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  danger_type TEXT NOT NULL,
  severity TEXT NOT NULL,
  location TEXT,
  warning TEXT NOT NULL,
  was_spoken BOOLEAN DEFAULT FALSE,
  user_acknowledged BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_see_dangers_user ON public.see_agent_dangers(user_id, created_at DESC);

-- User vision preferences (voice mode, detail level, FPS target)
CREATE TABLE IF NOT EXISTS public.see_agent_preferences (
  user_id TEXT PRIMARY KEY,
  voice_mode TEXT NOT NULL DEFAULT 'smart' CHECK (voice_mode IN ('auto', 'smart', 'manual')),
  detail_level TEXT NOT NULL DEFAULT 'brief' CHECK (detail_level IN ('brief', 'detailed')),
  enabled_dangers JSONB DEFAULT '["all"]',
  fps_target INTEGER NOT NULL DEFAULT 10,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS: allow authenticated users to access own data only (when using auth)
ALTER TABLE public.see_agent_analyses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.see_agent_dangers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.see_agent_preferences ENABLE ROW LEVEL SECURITY;

-- Policies: service role or anon with user_id in request can access (app handles auth)
CREATE POLICY "see_analyses_select_own" ON public.see_agent_analyses FOR SELECT USING (true);
CREATE POLICY "see_analyses_insert_own" ON public.see_agent_analyses FOR INSERT WITH CHECK (true);
CREATE POLICY "see_dangers_select_own" ON public.see_agent_dangers FOR SELECT USING (true);
CREATE POLICY "see_dangers_insert_own" ON public.see_agent_dangers FOR INSERT WITH CHECK (true);
CREATE POLICY "see_preferences_all" ON public.see_agent_preferences FOR ALL USING (true) WITH CHECK (true);
