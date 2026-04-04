-- ============================================================
-- Migration: Add is_archived column to schedule_sessions
-- Run this in Supabase Dashboard > SQL Editor
-- Required for the Sessions admin tab
-- ============================================================

-- 1. Add is_archived column (defaults to false)
ALTER TABLE dojo.schedule_sessions
  ADD COLUMN IF NOT EXISTS is_archived BOOLEAN DEFAULT FALSE;

-- 2. Ensure RLS policies allow writes from anon key
-- (These should already exist, but adding IF NOT EXISTS equivalent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'schedule_sessions'
      AND policyname = 'Allow anonymous insert'
      AND schemaname = 'dojo'
  ) THEN
    CREATE POLICY "Allow anonymous insert"
      ON dojo.schedule_sessions
      FOR INSERT
      WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'schedule_sessions'
      AND policyname = 'Allow anonymous update'
      AND schemaname = 'dojo'
  ) THEN
    CREATE POLICY "Allow anonymous update"
      ON dojo.schedule_sessions
      FOR UPDATE
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;
