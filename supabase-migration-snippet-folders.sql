-- Migration: add folder layer to snippets (速贴).
-- Safe to run on an existing database (uses IF NOT EXISTS where possible).

-- Folders table
CREATE TABLE IF NOT EXISTS public.snippet_folders (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

ALTER TABLE public.snippet_folders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own snippet_folders" ON public.snippet_folders;
CREATE POLICY "Users manage own snippet_folders" ON public.snippet_folders
  FOR ALL USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_snippet_folders_user_updated ON public.snippet_folders(user_id, updated_at);

DROP TRIGGER IF EXISTS snippet_folders_updated_at ON public.snippet_folders;
CREATE TRIGGER snippet_folders_updated_at BEFORE UPDATE ON public.snippet_folders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Add folder_id to snippets
ALTER TABLE public.snippets ADD COLUMN IF NOT EXISTS folder_id UUID REFERENCES public.snippet_folders(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_snippets_folder ON public.snippets(folder_id);
