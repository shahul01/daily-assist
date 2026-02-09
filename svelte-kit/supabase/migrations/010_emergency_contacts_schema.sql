-- Emergency contacts: stored in user_preferences with key 'emergency_contacts'.
-- Value JSONB shape: array of { id, name, relationship, phone, email?, priority, notifyFor[] }.
-- priority: 1 = primary. notifyFor: ['medical','fall','medication'] etc.
-- RLS: existing policy "Users can manage own user_preferences" applies.
-- No new tables; this migration documents the contract for emergency_contacts.

COMMENT ON TABLE public.user_preferences IS 'Key-value store. Known keys: emergency_contacts (JSONB array of emergency contact objects).';
