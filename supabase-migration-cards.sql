-- Migration: add decks + cards tables for memory card sync
-- Safe to run on an existing database (uses IF NOT EXISTS where possible)

-- Decks table
CREATE TABLE IF NOT EXISTS public.decks (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

-- Cards table (Ebbinghaus spaced repetition)
CREATE TABLE IF NOT EXISTS public.cards (
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

-- Enable RLS
ALTER TABLE public.decks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cards ENABLE ROW LEVEL SECURITY;

-- RLS policies (drop then recreate so it's idempotent)
DROP POLICY IF EXISTS "Users manage own decks" ON public.decks;
CREATE POLICY "Users manage own decks" ON public.decks
  FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users manage own cards" ON public.cards;
CREATE POLICY "Users manage own cards" ON public.cards
  FOR ALL USING (auth.uid() = user_id);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_decks_user_updated ON public.decks(user_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_cards_user_updated ON public.cards(user_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_cards_deck ON public.cards(deck_id);

-- Auto-update updated_at triggers (reuses existing update_updated_at function)
DROP TRIGGER IF EXISTS decks_updated_at ON public.decks;
CREATE TRIGGER decks_updated_at BEFORE UPDATE ON public.decks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS cards_updated_at ON public.cards;
CREATE TRIGGER cards_updated_at BEFORE UPDATE ON public.cards
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
