-- ============================================================
-- Migration: Plages de dates custom (date ranges)
-- Run this in Supabase Dashboard > SQL Editor BEFORE running seed-date-ranges.js
-- ============================================================

-- 1. Create date_ranges table
CREATE TABLE IF NOT EXISTS dojo.schedule_date_ranges (
  id TEXT PRIMARY KEY,
  session_id TEXT REFERENCES dojo.schedule_sessions(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  sort_order SMALLINT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Add date_range_id column to courses
ALTER TABLE dojo.schedule_courses
  ADD COLUMN IF NOT EXISTS date_range_id TEXT REFERENCES dojo.schedule_date_ranges(id) ON DELETE SET NULL;

-- 3. RLS — same permissive pattern as other tables
ALTER TABLE dojo.schedule_date_ranges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow anonymous read access"
  ON dojo.schedule_date_ranges
  FOR SELECT
  USING (true);

CREATE POLICY "Allow anonymous insert"
  ON dojo.schedule_date_ranges
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Allow anonymous update"
  ON dojo.schedule_date_ranges
  FOR UPDATE
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow anonymous delete"
  ON dojo.schedule_date_ranges
  FOR DELETE
  USING (true);

-- 4. Expose via PostgREST (dojo schema already exposed)
-- No action needed — table is in dojo schema which is already in the search_path.
