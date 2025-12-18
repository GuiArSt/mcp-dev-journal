-- ============================================
-- FIX: Change DATE columns to TEXT
-- ============================================
-- Run this in Supabase SQL Editor to fix date format issues
-- SQLite stores dates as "2023" or "2025-04", not full ISO dates

-- Skills table
ALTER TABLE skills ALTER COLUMN first_used TYPE TEXT;
ALTER TABLE skills ALTER COLUMN last_used TYPE TEXT;

-- Work experience table
ALTER TABLE work_experience ALTER COLUMN date_start TYPE TEXT;
ALTER TABLE work_experience ALTER COLUMN date_end TYPE TEXT;

-- Education table
ALTER TABLE education ALTER COLUMN date_start TYPE TEXT;
ALTER TABLE education ALTER COLUMN date_end TYPE TEXT;

-- Done!
-- Now re-run: node scripts/sync-to-supabase.js
