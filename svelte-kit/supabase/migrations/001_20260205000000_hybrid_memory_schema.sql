-- Hybrid Memory Schema for DailyAssist
-- Run in Supabase SQL Editor: Dashboard -> SQL Editor -> New query
-- Uses auth.users (Supabase Auth) - no separate user table.
-- Enable pgvector first: Dashboard -> Database -> Extensions -> vector

CREATE EXTENSION IF NOT EXISTS vector;

-- Memory types for semantic search (vector store)
CREATE TYPE memory_type_enum AS ENUM ('preference', 'goal', 'todo', 'event', 'fact');

-- Memories: main store with embedding for semantic search
-- user_id references auth.users(id)
CREATE TABLE IF NOT EXISTS public.memories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  memory_type memory_type_enum NOT NULL,
  category TEXT,

  text_content TEXT NOT NULL,
  summary TEXT,
  embedding vector(768),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_accessed TIMESTAMPTZ,
  valid_until TIMESTAMPTZ,

  access_count INTEGER NOT NULL DEFAULT 0,
  mention_count INTEGER NOT NULL DEFAULT 0,
  relevance_score REAL NOT NULL DEFAULT 0.5,
  confidence REAL NOT NULL DEFAULT 0.5,

  extraction_source TEXT,
  context_tags JSONB DEFAULT '{}',

  is_active BOOLEAN NOT NULL DEFAULT true,
  is_validated BOOLEAN NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_memories_user_type ON public.memories(user_id, memory_type);
CREATE INDEX IF NOT EXISTS idx_memories_last_accessed ON public.memories(last_accessed);
CREATE INDEX IF NOT EXISTS idx_memories_relevance ON public.memories(relevance_score DESC);
CREATE INDEX IF NOT EXISTS idx_memories_embedding ON public.memories USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- Graph: relationships between memories
CREATE TABLE IF NOT EXISTS public.memory_relationships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_memory_id UUID NOT NULL REFERENCES public.memories(id) ON DELETE CASCADE,
  to_memory_id UUID NOT NULL REFERENCES public.memories(id) ON DELETE CASCADE,

  relationship_type TEXT NOT NULL,
  strength REAL NOT NULL DEFAULT 0.5,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_referenced TIMESTAMPTZ,
  reference_count INTEGER NOT NULL DEFAULT 0,
  context TEXT,

  UNIQUE(from_memory_id, to_memory_id, relationship_type)
);

CREATE INDEX IF NOT EXISTS idx_memory_relationships_from ON public.memory_relationships(from_memory_id);
CREATE INDEX IF NOT EXISTS idx_memory_relationships_to ON public.memory_relationships(to_memory_id);

-- Key-value: fast lookups (user preferences, session cache)
CREATE TABLE IF NOT EXISTS public.user_preferences (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  value JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  access_count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, key)
);

CREATE INDEX IF NOT EXISTS idx_user_preferences_user ON public.user_preferences(user_id);

-- Goals (structured)
CREATE TABLE IF NOT EXISTS public.goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  memory_id UUID REFERENCES public.memories(id) ON DELETE SET NULL,

  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'completed', 'cancelled')),
  priority TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deadline TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  progress REAL NOT NULL DEFAULT 0.0
);

CREATE INDEX IF NOT EXISTS idx_goals_user_status ON public.goals(user_id, status);

-- Todos (structured)
CREATE TABLE IF NOT EXISTS public.todos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  memory_id UUID REFERENCES public.memories(id) ON DELETE SET NULL,
  goal_id UUID REFERENCES public.goals(id) ON DELETE SET NULL,

  task TEXT NOT NULL,
  description TEXT,
  completed BOOLEAN NOT NULL DEFAULT false,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  due_date TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  priority TEXT,
  estimated_hours REAL,
  tags JSONB DEFAULT '[]'
);

CREATE INDEX IF NOT EXISTS idx_todos_user_completed ON public.todos(user_id, completed);
CREATE INDEX IF NOT EXISTS idx_todos_goal ON public.todos(goal_id);

-- Events (temporal)
CREATE TABLE IF NOT EXISTS public.events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  memory_id UUID REFERENCES public.memories(id) ON DELETE SET NULL,

  title TEXT NOT NULL,
  description TEXT,
  event_type TEXT,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  impact_score REAL,
  context JSONB DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_events_user_timestamp ON public.events(user_id, timestamp DESC);

-- Learned rules (behavioral patterns)
CREATE TABLE IF NOT EXISTS public.learned_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  rule_type TEXT NOT NULL,
  pattern TEXT NOT NULL,
  confidence REAL NOT NULL,
  data_points INTEGER NOT NULL DEFAULT 0,
  examples JSONB DEFAULT '[]',
  actions JSONB DEFAULT '[]',

  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_applied TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_learned_rules_user ON public.learned_rules(user_id);

-- Frequency tracking (for pattern learning)
CREATE TABLE IF NOT EXISTS public.frequency_tracking (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL,
  entity_value TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 1,
  first_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  contexts JSONB DEFAULT '[]',
  PRIMARY KEY (user_id, entity_type, entity_value)
);

CREATE INDEX IF NOT EXISTS idx_frequency_user ON public.frequency_tracking(user_id, count DESC);

-- RLS: allow users to access only their own data
ALTER TABLE public.memories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.memory_relationships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.todos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.learned_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.frequency_tracking ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own memories" ON public.memories
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can manage own memory_relationships" ON public.memory_relationships
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.memories m WHERE m.id = from_memory_id AND m.user_id = auth.uid())
  );

CREATE POLICY "Users can manage own user_preferences" ON public.user_preferences
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can manage own goals" ON public.goals
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can manage own todos" ON public.todos
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can manage own events" ON public.events
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can manage own learned_rules" ON public.learned_rules
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can manage own frequency_tracking" ON public.frequency_tracking
  FOR ALL USING (auth.uid() = user_id);

-- Function: similarity search (for RPC from client or server)
CREATE OR REPLACE FUNCTION public.match_memories(
  query_embedding vector(768),
  match_user_id UUID,
  match_threshold REAL DEFAULT 0.5,
  match_count INT DEFAULT 5,
  filter_type memory_type_enum DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  text_content TEXT,
  memory_type memory_type_enum,
  category TEXT,
  relevance_score REAL,
  similarity REAL
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    m.id,
    m.text_content,
    m.memory_type,
    m.category,
    m.relevance_score,
    1 - (m.embedding <=> query_embedding) AS similarity
  FROM public.memories m
  WHERE m.user_id = match_user_id
    AND m.is_active = true
    AND (filter_type IS NULL OR m.memory_type = filter_type)
    AND (1 - (m.embedding <=> query_embedding)) > match_threshold
  ORDER BY m.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- Trigger: updated_at
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER memories_updated_at BEFORE UPDATE ON public.memories
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER user_preferences_updated_at BEFORE UPDATE ON public.user_preferences
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER goals_updated_at BEFORE UPDATE ON public.goals
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER todos_updated_at BEFORE UPDATE ON public.todos
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER learned_rules_updated_at BEFORE UPDATE ON public.learned_rules
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
