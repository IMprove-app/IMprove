-- Run this in Supabase Dashboard > SQL Editor

-- Profiles table (auto-created on sign up via trigger)
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Habits table
CREATE TABLE public.habits (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  icon TEXT NOT NULL DEFAULT 'target',
  target_url TEXT DEFAULT '',
  target_app TEXT DEFAULT '',
  daily_goal_m INTEGER DEFAULT 30,
  sort_order INTEGER DEFAULT 0,
  is_archived INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

-- Sessions table
CREATE TABLE public.sessions (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  habit_id UUID NOT NULL,
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ,
  active_sec INTEGER DEFAULT 0,
  idle_sec INTEGER DEFAULT 0,
  notes TEXT DEFAULT '',
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Decks table (memory card decks)
CREATE TABLE public.decks (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

-- Cards table (memory cards with Ebbinghaus spaced repetition)
CREATE TABLE public.cards (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  deck_id UUID NOT NULL,
  front TEXT NOT NULL,
  back TEXT NOT NULL,
  review_stage INTEGER DEFAULT 0,
  next_review_at TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

-- Todos table (待办事项)
CREATE TABLE public.todos (
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
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.habits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.decks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.todos ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users manage own profile" ON public.profiles
  FOR ALL USING (auth.uid() = id);

CREATE POLICY "Users manage own habits" ON public.habits
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users manage own sessions" ON public.sessions
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users manage own decks" ON public.decks
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users manage own cards" ON public.cards
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users manage own todos" ON public.todos
  FOR ALL USING (auth.uid() = user_id);

-- Indexes
CREATE INDEX idx_habits_user_updated ON public.habits(user_id, updated_at);
CREATE INDEX idx_sessions_user_updated ON public.sessions(user_id, updated_at);
CREATE INDEX idx_decks_user_updated ON public.decks(user_id, updated_at);
CREATE INDEX idx_cards_user_updated ON public.cards(user_id, updated_at);
CREATE INDEX idx_cards_deck ON public.cards(deck_id);
CREATE INDEX idx_todos_user_updated ON public.todos(user_id, updated_at);
CREATE INDEX idx_todos_user_due_date ON public.todos(user_id, due_date);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER habits_updated_at BEFORE UPDATE ON public.habits
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER sessions_updated_at BEFORE UPDATE ON public.sessions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER decks_updated_at BEFORE UPDATE ON public.decks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER cards_updated_at BEFORE UPDATE ON public.cards
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER todos_updated_at BEFORE UPDATE ON public.todos
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Auto-create profile on sign up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email)
  VALUES (NEW.id, NEW.email);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- === Phase 1 Achievements ===
-- achievements + badge_events tables and progress fields on profiles.

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

ALTER TABLE public.achievements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.badge_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own achievements" ON public.achievements;
CREATE POLICY "Users manage own achievements" ON public.achievements
  FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users manage own badge_events" ON public.badge_events;
CREATE POLICY "Users manage own badge_events" ON public.badge_events
  FOR ALL USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_achievements_user_updated ON public.achievements(user_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_badge_events_user_updated ON public.badge_events(user_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_badge_events_user_type ON public.badge_events(user_id, event_type);

DROP TRIGGER IF EXISTS achievements_updated_at ON public.achievements;
CREATE TRIGGER achievements_updated_at BEFORE UPDATE ON public.achievements
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS badge_events_updated_at ON public.badge_events;
CREATE TRIGGER badge_events_updated_at BEFORE UPDATE ON public.badge_events
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
