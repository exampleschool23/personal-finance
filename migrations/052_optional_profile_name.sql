-- Optional personal name; existing owner policies protect this field.
ALTER TABLE public.user_preferences ADD COLUMN IF NOT EXISTS display_name text NOT NULL DEFAULT '' CHECK (char_length(display_name) <= 80);
