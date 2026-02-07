-- Say-It-For-Me Agent Schema for DailyAssist
-- Quick phrases, voice preferences, voice profiles (Tier 2), voice clones and conversation sessions (Tier 3).

-- Quick phrases library (Tier 1)
CREATE TABLE IF NOT EXISTS public.quick_phrases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  phrase TEXT NOT NULL,
  category TEXT CHECK (category IN ('greeting', 'need', 'emergency', 'emotion', 'custom') OR category IS NULL),
  emotion TEXT CHECK (emotion IN ('happy', 'sad', 'urgent', 'calm', 'neutral', 'excited', 'worried', 'tired', 'confident') OR emotion IS NULL),
  language TEXT DEFAULT 'en-US',
  is_default BOOLEAN NOT NULL DEFAULT false,
  usage_count INTEGER NOT NULL DEFAULT 0,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_quick_phrases_user ON public.quick_phrases(user_id);
CREATE INDEX IF NOT EXISTS idx_quick_phrases_user_category ON public.quick_phrases(user_id, category);
CREATE INDEX IF NOT EXISTS idx_quick_phrases_is_default ON public.quick_phrases(is_default) WHERE is_default = true;
CREATE INDEX IF NOT EXISTS idx_quick_phrases_language ON public.quick_phrases(language);

-- User voice preferences (Tier 1)
CREATE TABLE IF NOT EXISTS public.voice_preferences (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,

  pitch REAL NOT NULL DEFAULT 1.0 CHECK (pitch >= 0 AND pitch <= 2),
  rate REAL NOT NULL DEFAULT 1.0 CHECK (rate >= 0.1 AND rate <= 10),
  volume REAL NOT NULL DEFAULT 1.0 CHECK (volume >= 0 AND volume <= 1),
  language TEXT NOT NULL DEFAULT 'en-US',
  voice_uri TEXT,
  emergency_volume REAL NOT NULL DEFAULT 1.0 CHECK (emergency_volume >= 0 AND emergency_volume <= 1),
  emergency_rate REAL NOT NULL DEFAULT 0.9 CHECK (emergency_rate >= 0.5 AND emergency_rate <= 2),

  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Voice profiles for quick switch (Tier 2)
CREATE TABLE IF NOT EXISTS public.voice_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  name TEXT NOT NULL,
  pitch REAL NOT NULL DEFAULT 1.0 CHECK (pitch >= 0 AND pitch <= 2),
  rate REAL NOT NULL DEFAULT 1.0 CHECK (rate >= 0.1 AND rate <= 10),
  volume REAL NOT NULL DEFAULT 1.0 CHECK (volume >= 0 AND volume <= 1),
  language TEXT NOT NULL DEFAULT 'en-US',
  voice_uri TEXT,
  is_active BOOLEAN NOT NULL DEFAULT false,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_voice_profiles_user ON public.voice_profiles(user_id);

-- Voice clones (Tier 3) - provider metadata only; audio stored externally
CREATE TABLE IF NOT EXISTS public.voice_clones (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,

  clone_id TEXT,
  provider TEXT CHECK (provider IN ('elevenlabs', 'playht', 'coqui') OR provider IS NULL),
  sample_duration_seconds INTEGER,
  training_status TEXT CHECK (training_status IN ('uploading', 'training', 'ready', 'failed') OR training_status IS NULL),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  trained_at TIMESTAMPTZ
);

-- Conversation sessions (Tier 3)
CREATE TABLE IF NOT EXISTS public.conversation_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  duration_seconds INTEGER,
  turn_count INTEGER NOT NULL DEFAULT 0,
  summary TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_conversation_sessions_user ON public.conversation_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_conversation_sessions_started ON public.conversation_sessions(started_at DESC);

-- Conversation turns (Tier 3)
CREATE TABLE IF NOT EXISTS public.conversation_turns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.conversation_sessions(id) ON DELETE CASCADE,

  turn_number INTEGER NOT NULL,
  speaker TEXT NOT NULL CHECK (speaker IN ('user', 'assistant')),
  text TEXT,
  audio_url TEXT,
  emotion TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_conversation_turns_session ON public.conversation_turns(session_id);

-- Triggers: updated_at
CREATE TRIGGER quick_phrases_updated_at
  BEFORE UPDATE ON public.quick_phrases
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER voice_preferences_updated_at
  BEFORE UPDATE ON public.voice_preferences
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- RLS for user-scoped tables
ALTER TABLE public.quick_phrases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.voice_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.voice_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.voice_clones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_turns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own quick_phrases" ON public.quick_phrases
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can manage own voice_preferences" ON public.voice_preferences
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can manage own voice_profiles" ON public.voice_profiles
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can manage own voice_clones" ON public.voice_clones
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can manage own conversation_sessions" ON public.conversation_sessions
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can manage own conversation_turns" ON public.conversation_turns
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.conversation_sessions s
      WHERE s.id = conversation_turns.session_id AND s.user_id = auth.uid()
    )
  );
