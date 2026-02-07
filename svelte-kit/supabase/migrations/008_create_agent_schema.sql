-- Create-For-Me Agent: character profiles, generations, deletion notifications
-- user_id is TEXT to match API/client

CREATE TABLE IF NOT EXISTS public.character_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  reference_images JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_character_profiles_user ON public.character_profiles(user_id);

CREATE TABLE IF NOT EXISTS public.create_agent_generations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('image', 'video')),
  prompt TEXT NOT NULL,
  model TEXT NOT NULL,
  result_storage_path TEXT,
  result_mime_type TEXT,
  metadata JSONB,
  character_profile_id UUID REFERENCES public.character_profiles(id) ON DELETE SET NULL,
  expires_at TIMESTAMPTZ,
  deleted BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_create_generations_user ON public.create_agent_generations(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_create_generations_expires ON public.create_agent_generations(expires_at) WHERE deleted = FALSE;

CREATE TABLE IF NOT EXISTS public.media_deletion_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  generation_id UUID REFERENCES public.create_agent_generations(id) ON DELETE CASCADE,
  notification_type TEXT NOT NULL CHECK (notification_type IN ('3_days_before', 'on_deletion', 'after_deletion')),
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_media_deletion_gen ON public.media_deletion_notifications(generation_id);

ALTER TABLE public.character_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.create_agent_generations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.media_deletion_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "character_profiles_select" ON public.character_profiles FOR SELECT USING (true);
CREATE POLICY "character_profiles_insert" ON public.character_profiles FOR INSERT WITH CHECK (true);
CREATE POLICY "character_profiles_update" ON public.character_profiles FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "character_profiles_delete" ON public.character_profiles FOR DELETE USING (true);

CREATE POLICY "create_generations_select" ON public.create_agent_generations FOR SELECT USING (true);
CREATE POLICY "create_generations_insert" ON public.create_agent_generations FOR INSERT WITH CHECK (true);
CREATE POLICY "create_generations_update" ON public.create_agent_generations FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "create_generations_delete" ON public.create_agent_generations FOR DELETE USING (true);

CREATE POLICY "media_deletion_select" ON public.media_deletion_notifications FOR SELECT USING (true);
CREATE POLICY "media_deletion_insert" ON public.media_deletion_notifications FOR INSERT WITH CHECK (true);

-- Storage bucket: create via storage.buckets (Supabase managed schema)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'generated-media',
  'generated-media',
  false,
  104857600,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'video/mp4']
)
ON CONFLICT (id) DO NOTHING;

-- RLS for storage.objects: allow service role to manage; restrict by bucket
CREATE POLICY "generated_media_all" ON storage.objects
FOR ALL
USING (bucket_id = 'generated-media')
WITH CHECK (bucket_id = 'generated-media');
