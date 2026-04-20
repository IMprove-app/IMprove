-- Migration: add category to habits (Phase 2a)
-- Run this in Supabase Dashboard > SQL Editor on existing deployments.
-- Idempotent: safe to re-run.

ALTER TABLE public.habits
  ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'uncategorized';
