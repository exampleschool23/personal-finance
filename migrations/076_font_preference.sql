-- Interface font chosen in Settings; the web and mobile apps read the same
-- value. Existing owners keep Inter. Owner RLS already protects the row.
-- Apply after 075.
ALTER TABLE public.user_preferences ADD COLUMN IF NOT EXISTS font text NOT NULL DEFAULT 'inter' CHECK (font IN ('inter','onest'));
NOTIFY pgrst, 'reload schema';
