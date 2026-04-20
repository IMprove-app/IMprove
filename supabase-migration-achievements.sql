-- Migration: add achievements + badge_events + user progress fields
-- Safe to run on an existing database (uses IF NOT EXISTS where possible)

CREATE TABLE IF NOT EXISTS public.achievements (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  unlocked_at TIMESTAMPTZ NOT NULL,
  progress_snapshot TEXT,
  is_silent INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  UNIQUE (user_id, code)
);

CREATE TABLE IF NOT EXISTS public.badge_events (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  habit_id UUID,
  session_id UUID,
  card_id UUID,
  todo_id UUID,
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  active_sec INTEGER,
  payload TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

-- profile columns for user progress
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS level INTEGER NOT NULL DEFAULT 1;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS xp INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS total_xp INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS total_stars INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS xp_multiplier REAL NOT NULL DEFAULT 1.0;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS rebirth_count INTEGER NOT NULL DEFAULT 0;

-- RLS
ALTER TABLE public.achievements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.badge_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own achievements" ON public.achievements;
CREATE POLICY "Users manage own achievements" ON public.achievements
  FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users manage own badge_events" ON public.badge_events;
CREATE POLICY "Users manage own badge_events" ON public.badge_events
  FOR ALL USING (auth.uid() = user_id);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_achievements_user_updated ON public.achievements(user_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_badge_events_user_updated ON public.badge_events(user_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_badge_events_user_type ON public.badge_events(user_id, event_type);

-- updated_at triggers (reuse existing update_updated_at function)
DROP TRIGGER IF EXISTS achievements_updated_at ON public.achievements;
CREATE TRIGGER achievements_updated_at BEFORE UPDATE ON public.achievements
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS badge_events_updated_at ON public.badge_events;
CREATE TRIGGER badge_events_updated_at BEFORE UPDATE ON public.badge_events
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
