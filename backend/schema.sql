-- AlwaysSunny Database Schema for Supabase
-- Run this in Supabase SQL Editor: https://app.supabase.com → SQL Editor → New Query

-- ============================================================================
-- 1. Profiles table (extends Supabase auth.users)
-- ============================================================================
CREATE TABLE IF NOT EXISTS profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT,
    display_name TEXT,
    onboarding_complete BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, email)
    VALUES (NEW.id, NEW.email);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================================
-- 2. User credentials (encrypted API keys per user)
-- ============================================================================
CREATE TABLE IF NOT EXISTS user_credentials (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    solax_token_id TEXT DEFAULT '',
    solax_dongle_sn TEXT DEFAULT '',
    tessie_api_key TEXT DEFAULT '',
    tessie_vin TEXT DEFAULT '',
    telegram_bot_token TEXT DEFAULT '',
    telegram_chat_id TEXT DEFAULT '',
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- 3. Settings (key-value per user)
-- ============================================================================
CREATE TABLE IF NOT EXISTS settings (
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    key TEXT NOT NULL,
    value TEXT DEFAULT '',
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (user_id, key)
);

-- ============================================================================
-- 4. Charging sessions
-- ============================================================================
CREATE TABLE IF NOT EXISTS sessions (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ended_at TIMESTAMPTZ,
    duration_mins INTEGER,
    kwh_added REAL,
    solar_kwh REAL,
    grid_kwh REAL,
    solar_pct REAL,
    saved_amount REAL,
    electricity_rate REAL,
    start_soc INTEGER,
    end_soc INTEGER,
    target_soc INTEGER,
    subsidy_calculation_method TEXT DEFAULT 'estimated'
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_started
    ON sessions(user_id, started_at DESC);

-- ============================================================================
-- 5. Energy snapshots (every 60s during active session)
-- ============================================================================
CREATE TABLE IF NOT EXISTS snapshots (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    solar_w REAL,
    grid_w REAL,
    battery_soc INTEGER,
    battery_w REAL,
    household_w REAL,
    tesla_amps INTEGER,
    tesla_soc INTEGER,
    ai_recommended_amps INTEGER,
    ai_reasoning TEXT,
    ai_confidence TEXT,
    mode TEXT
);

CREATE INDEX IF NOT EXISTS idx_snapshots_user_ts
    ON snapshots(user_id, timestamp DESC);

-- ============================================================================
-- 6. Daily summaries (computed nightly)
-- ============================================================================
CREATE TABLE IF NOT EXISTS daily_summary (
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    total_solar_kwh REAL DEFAULT 0,
    total_grid_kwh REAL DEFAULT 0,
    total_sessions INTEGER DEFAULT 0,
    total_saved_amount REAL DEFAULT 0,
    avg_solar_pct REAL DEFAULT 0,
    PRIMARY KEY (user_id, date)
);

-- ============================================================================
-- 7. Row-Level Security (RLS)
-- ============================================================================

-- Profiles
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own profile"
    ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile"
    ON profiles FOR UPDATE USING (auth.uid() = id);

-- User credentials
ALTER TABLE user_credentials ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own credentials"
    ON user_credentials FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own credentials"
    ON user_credentials FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own credentials"
    ON user_credentials FOR UPDATE USING (auth.uid() = user_id);

-- Settings
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own settings"
    ON settings FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own settings"
    ON settings FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own settings"
    ON settings FOR UPDATE USING (auth.uid() = user_id);

-- Sessions
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own sessions"
    ON sessions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own sessions"
    ON sessions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own sessions"
    ON sessions FOR UPDATE USING (auth.uid() = user_id);

-- Snapshots
ALTER TABLE snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own snapshots"
    ON snapshots FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own snapshots"
    ON snapshots FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Daily summary
ALTER TABLE daily_summary ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own daily summary"
    ON daily_summary FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own daily summary"
    ON daily_summary FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own daily summary"
    ON daily_summary FOR UPDATE USING (auth.uid() = user_id);
