-- Remember-For-Me Agent: medications, appointments, escalations, pattern_analysis
-- Uses auth.users(id). Run after 001–004.

-- Medications: schedules and adherence tracking
CREATE TABLE IF NOT EXISTS public.medications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  name TEXT NOT NULL,
  dosage TEXT,
  schedule_times JSONB NOT NULL DEFAULT '[]',
  frequency TEXT CHECK (frequency IN ('once_daily', 'twice_daily', 'three_times_daily', 'as_needed', 'weekly', 'custom')),
  start_date TIMESTAMPTZ,
  end_date TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  is_critical BOOLEAN NOT NULL DEFAULT false,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_medications_user_active ON public.medications(user_id, is_active);

-- Medication logs: taken / missed / late
CREATE TABLE IF NOT EXISTS public.medication_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  medication_id UUID NOT NULL REFERENCES public.medications(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  scheduled_time TIMESTAMPTZ NOT NULL,
  taken_at TIMESTAMPTZ,
  status TEXT NOT NULL CHECK (status IN ('taken', 'missed', 'late', 'skipped')),
  notes TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_medication_logs_medication ON public.medication_logs(medication_id, scheduled_time);
CREATE INDEX IF NOT EXISTS idx_medication_logs_user_status ON public.medication_logs(user_id, status);

-- Appointments: structured events with reminders
CREATE TABLE IF NOT EXISTS public.appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  title TEXT NOT NULL,
  description TEXT,
  appointment_time TIMESTAMPTZ NOT NULL,
  duration_minutes INTEGER DEFAULT 60,
  location TEXT,
  appointment_type TEXT CHECK (appointment_type IN ('doctor', 'therapy', 'personal', 'other')),
  reminder_minutes_before INTEGER[] DEFAULT ARRAY[15, 60],
  status TEXT NOT NULL DEFAULT 'upcoming' CHECK (status IN ('upcoming', 'completed', 'cancelled', 'no_show')),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_appointments_user_time ON public.appointments(user_id, appointment_time);
CREATE INDEX IF NOT EXISTS idx_appointments_status ON public.appointments(status);

-- Escalations: reminder/medication/appointment escalation tracking
CREATE TABLE IF NOT EXISTS public.escalations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  reminder_id UUID REFERENCES public.todos(id) ON DELETE SET NULL,
  medication_id UUID REFERENCES public.medications(id) ON DELETE SET NULL,
  appointment_id UUID REFERENCES public.appointments(id) ON DELETE SET NULL,

  escalation_type TEXT NOT NULL CHECK (escalation_type IN ('reminder', 'medication', 'appointment')),
  severity TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'resolved', 'dismissed')),

  triggered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  contact_method TEXT CHECK (contact_method IN ('in_app', 'email', 'sms', 'call')),
  contact_info TEXT,
  message TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_escalations_user_status ON public.escalations(user_id, status);
CREATE INDEX IF NOT EXISTS idx_escalations_severity_triggered ON public.escalations(severity, triggered_at DESC);

-- Pattern analysis: stored detection results
CREATE TABLE IF NOT EXISTS public.pattern_analysis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  pattern_type TEXT NOT NULL CHECK (pattern_type IN ('missed_medication', 'late_task', 'appointment_pattern', 'adherence_trend')),
  pattern_data JSONB NOT NULL DEFAULT '{}',
  confidence_score REAL NOT NULL DEFAULT 0,
  detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  occurrences_count INTEGER NOT NULL DEFAULT 0,
  last_occurrence TIMESTAMPTZ,
  suggestion TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pattern_analysis_user_type ON public.pattern_analysis(user_id, pattern_type, is_active);
CREATE INDEX IF NOT EXISTS idx_pattern_analysis_confidence ON public.pattern_analysis(confidence_score DESC);

-- RLS
ALTER TABLE public.medications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.medication_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.escalations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pattern_analysis ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own medications" ON public.medications
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can manage own medication_logs" ON public.medication_logs
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can manage own appointments" ON public.appointments
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can manage own escalations" ON public.escalations
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can manage own pattern_analysis" ON public.pattern_analysis
  FOR ALL USING (auth.uid() = user_id);
