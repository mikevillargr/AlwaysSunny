-- Migration 001: Rename hardcoded currency fields to generic names
-- Run in Supabase SQL Editor

-- 1. Rename saved_pesos → saved_amount in sessions table
ALTER TABLE sessions RENAME COLUMN saved_pesos TO saved_amount;

-- 2. Rename meralco_rate → electricity_rate in sessions table
ALTER TABLE sessions RENAME COLUMN meralco_rate TO electricity_rate;

-- 3. Rename total_saved_pesos → total_saved_amount in daily_summary table
ALTER TABLE daily_summary RENAME COLUMN total_saved_pesos TO total_saved_amount;

-- 4. Migrate settings key-value pairs (meralco_rate → electricity_rate)
UPDATE settings SET key = 'electricity_rate' WHERE key = 'meralco_rate';
UPDATE settings SET key = 'electricity_rate_updated_at' WHERE key = 'meralco_rate_updated_at';
