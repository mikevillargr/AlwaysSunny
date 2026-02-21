-- Migration 002: Add subsidy_calculation_method column to sessions table
-- Run in Supabase SQL Editor

ALTER TABLE sessions ADD COLUMN IF NOT EXISTS subsidy_calculation_method TEXT DEFAULT 'estimated';
