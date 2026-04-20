-- Migration: add Star Shield columns (Phase 2b)
-- Run this in Supabase Dashboard > SQL Editor on existing deployments.
-- Idempotent: safe to re-run.

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS shields INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS shield_month TEXT NOT NULL DEFAULT '';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS shield_used_this_month INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS total_shields_used INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS is_shield INTEGER NOT NULL DEFAULT 0;
