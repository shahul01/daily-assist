-- Hear-For-Me Agent: transcriptions, sound detections, speaker profiles, preferences
-- user_id is TEXT to match API/client

CREATE TABLE IF NOT EXISTS public.hear_agent_transcriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  transcript TEXT NOT NULL,
  speaker_id TEXT,
  sentiment JSONB,
  audio_duration_ms INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hear_transcriptions_user_time ON public.hear_agent_transcriptions(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.hear_agent_sounds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  sound_type TEXT NOT NULL,
  urgency TEXT NOT NULL,
  confidence NUMERIC,
  user_acknowledged BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hear_sounds_user ON public.hear_agent_sounds(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.hear_agent_speakers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  speaker_id TEXT NOT NULL,
  voice_profile JSONB,
  label TEXT,
  first_heard TIMESTAMPTZ DEFAULT NOW(),
  last_heard TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, speaker_id)
);

CREATE INDEX IF NOT EXISTS idx_hear_speakers_user ON public.hear_agent_speakers(user_id);

CREATE TABLE IF NOT EXISTS public.hear_agent_preferences (
  user_id TEXT PRIMARY KEY,
  alert_sounds JSONB DEFAULT '["doorbell", "alarm", "crying", "smoke_alarm"]',
  auto_transcribe BOOLEAN DEFAULT TRUE,
  speaker_identification BOOLEAN DEFAULT TRUE,
  sentiment_analysis BOOLEAN DEFAULT FALSE,
  min_confidence NUMERIC DEFAULT 0.6,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.hear_agent_transcriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hear_agent_sounds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hear_agent_speakers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hear_agent_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "hear_transcriptions_select" ON public.hear_agent_transcriptions FOR SELECT USING (true);
CREATE POLICY "hear_transcriptions_insert" ON public.hear_agent_transcriptions FOR INSERT WITH CHECK (true);
CREATE POLICY "hear_sounds_select" ON public.hear_agent_sounds FOR SELECT USING (true);
CREATE POLICY "hear_sounds_insert" ON public.hear_agent_sounds FOR INSERT WITH CHECK (true);
CREATE POLICY "hear_speakers_all" ON public.hear_agent_speakers FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "hear_preferences_all" ON public.hear_agent_preferences FOR ALL USING (true) WITH CHECK (true);
