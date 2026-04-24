-- Migration: add task_sessions table for tasks progress bar (任务进行栏) sync,
-- plus in_tasks_bar flag on the existing todos table.
-- Safe to run on an existing database (uses IF NOT EXISTS where possible).

-- Todos: add in_tasks_bar flag (0/1). Default 0 for legacy rows.
ALTER TABLE public.todos ADD COLUMN IF NOT EXISTS in_tasks_bar INTEGER NOT NULL DEFAULT 0;

-- Task sessions table
CREATE TABLE IF NOT EXISTS public.task_sessions (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  todo_id UUID NOT NULL,
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ,
  active_sec INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

-- Enable RLS
ALTER TABLE public.task_sessions ENABLE ROW LEVEL SECURITY;

-- RLS policy (drop then recreate so it's idempotent)
DROP POLICY IF EXISTS "Users manage own task_sessions" ON public.task_sessions;
CREATE POLICY "Users manage own task_sessions" ON public.task_sessions
  FOR ALL USING (auth.uid() = user_id);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_task_sessions_user_updated ON public.task_sessions(user_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_task_sessions_user_todo ON public.task_sessions(user_id, todo_id);

-- Auto-update updated_at trigger (reuses existing update_updated_at function)
DROP TRIGGER IF EXISTS task_sessions_updated_at ON public.task_sessions;
CREATE TRIGGER task_sessions_updated_at BEFORE UPDATE ON public.task_sessions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
