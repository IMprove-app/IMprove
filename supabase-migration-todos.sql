-- Migration: add todos table for todo (待办事项) sync
-- Safe to run on an existing database (uses IF NOT EXISTS where possible)

-- Todos table
CREATE TABLE IF NOT EXISTS public.todos (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  due_date TEXT NOT NULL,
  is_done INTEGER NOT NULL DEFAULT 0,
  completed_at TIMESTAMPTZ,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

-- Enable RLS
ALTER TABLE public.todos ENABLE ROW LEVEL SECURITY;

-- RLS policy (drop then recreate so it's idempotent)
DROP POLICY IF EXISTS "Users manage own todos" ON public.todos;
CREATE POLICY "Users manage own todos" ON public.todos
  FOR ALL USING (auth.uid() = user_id);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_todos_user_updated ON public.todos(user_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_todos_user_due_date ON public.todos(user_id, due_date);

-- Auto-update updated_at trigger (reuses existing update_updated_at function)
DROP TRIGGER IF EXISTS todos_updated_at ON public.todos;
CREATE TRIGGER todos_updated_at BEFORE UPDATE ON public.todos
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
