-- Write-For-Me Agent Schema for DailyAssist
-- Drafts, templates, style profiles, and draft history.

-- Drafts: work in progress (emails, letters, documents)
CREATE TABLE IF NOT EXISTS public.drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  title TEXT,
  content TEXT NOT NULL,
  draft_type TEXT CHECK (draft_type IN ('email', 'letter', 'document', 'other') OR draft_type IS NULL),
  metadata JSONB DEFAULT '{}',

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_drafts_user ON public.drafts(user_id);
CREATE INDEX IF NOT EXISTS idx_drafts_updated ON public.drafts(updated_at DESC);

-- Writing templates: reusable patterns (global and per-user)
CREATE TABLE IF NOT EXISTS public.writing_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,

  name TEXT NOT NULL,
  description TEXT,
  template_type TEXT NOT NULL,
  content TEXT NOT NULL,
  variables JSONB DEFAULT '[]',
  usage_count INTEGER NOT NULL DEFAULT 0,
  is_public BOOLEAN NOT NULL DEFAULT false,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_writing_templates_user ON public.writing_templates(user_id);
CREATE INDEX IF NOT EXISTS idx_writing_templates_type ON public.writing_templates(template_type);

-- Style profiles: learned writing patterns per user
CREATE TABLE IF NOT EXISTS public.style_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,

  vocabulary_preferences JSONB DEFAULT '{}',
  sentence_patterns JSONB DEFAULT '{}',
  common_phrases TEXT[] DEFAULT '{}',
  tone_preference TEXT,
  formality_level INTEGER CHECK (formality_level >= 1 AND formality_level <= 5),
  sample_count INTEGER NOT NULL DEFAULT 0,
  confidence_score REAL NOT NULL DEFAULT 0.0,

  last_updated TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_style_profiles_user ON public.style_profiles(user_id);

-- Draft history: version tracking for multi-turn editing
CREATE TABLE IF NOT EXISTS public.draft_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  draft_id UUID NOT NULL REFERENCES public.drafts(id) ON DELETE CASCADE,

  version INTEGER NOT NULL,
  content TEXT NOT NULL,
  change_summary TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_draft_history_draft ON public.draft_history(draft_id, version DESC);
