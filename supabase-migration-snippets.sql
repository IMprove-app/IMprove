-- Migration: add snippets table for clipboard snippet (快速粘贴) sync
-- Safe to run on an existing database (uses IF NOT EXISTS where possible)

-- Snippets table
CREATE TABLE IF NOT EXISTS public.snippets (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

-- Enable RLS
ALTER TABLE public.snippets ENABLE ROW LEVEL SECURITY;

-- RLS policy (drop then recreate so it's idempotent)
DROP POLICY IF EXISTS "Users manage own snippets" ON public.snippets;
CREATE POLICY "Users manage own snippets" ON public.snippets
  FOR ALL USING (auth.uid() = user_id);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_snippets_user_updated ON public.snippets(user_id, updated_at);

-- Auto-update updated_at trigger (reuses existing update_updated_at function)
DROP TRIGGER IF EXISTS snippets_updated_at ON public.snippets;
CREATE TRIGGER snippets_updated_at BEFORE UPDATE ON public.snippets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
