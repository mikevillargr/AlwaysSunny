-- Add location and cost tracking fields to sessions table
-- Run this migration in Supabase SQL editor

ALTER TABLE sessions ADD COLUMN IF NOT EXISTS latitude REAL;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS longitude REAL;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS location_name TEXT;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS is_supercharger BOOLEAN DEFAULT FALSE;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS actual_cost REAL;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS charged_at_home BOOLEAN DEFAULT TRUE;

-- Update existing sessions to mark them as home charging (default)
UPDATE sessions SET charged_at_home = TRUE WHERE charged_at_home IS NULL;
