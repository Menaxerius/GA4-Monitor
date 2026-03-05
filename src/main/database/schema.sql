-- GA4 Monitor Database Schema (SQLite for sql.js compatible)

-- Properties Table
CREATE TABLE IF NOT EXISTS properties (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    property_id TEXT UNIQUE NOT NULL,
    display_name TEXT NOT NULL,
    account_name TEXT,
    is_favorite INTEGER DEFAULT 0,
    website_url TEXT,
    cookie_banner_detected INTEGER DEFAULT 0,
    cookie_banner_last_checked DATETIME,
    last_accessed_by_account TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Test Results Table
CREATE TABLE IF NOT EXISTS test_results (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    property_id TEXT NOT NULL,
    test_type TEXT NOT NULL,
    start_date TEXT NOT NULL,
    end_date TEXT NOT NULL,
    comparison_start_date TEXT NOT NULL,
    comparison_end_date TEXT NOT NULL,
    total_events INTEGER,
    comparison_total_events INTEGER,
    percent_change REAL,
    anomaly_count INTEGER DEFAULT 0,
    status TEXT NOT NULL,
    error_message TEXT,
    created_at TEXT DEFAULT (datetime('now'))
);

-- Event Details Table
CREATE TABLE IF NOT EXISTS event_details (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    test_result_id INTEGER NOT NULL,
    event_name TEXT NOT NULL,
    event_count INTEGER NOT NULL,
    comparison_count INTEGER NOT NULL,
    percent_change REAL,
    is_anomaly INTEGER DEFAULT 0,
    anomaly_reason TEXT,
    created_at TEXT DEFAULT (datetime('now'))
);

-- Configuration Table
CREATE TABLE IF NOT EXISTS configuration (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key TEXT UNIQUE NOT NULL,
    value TEXT NOT NULL,
    description TEXT,
    updated_at TEXT DEFAULT (datetime('now'))
);

-- Scheduled Tasks Table
CREATE TABLE IF NOT EXISTS scheduled_tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    property_id TEXT NOT NULL,
    task_type TEXT NOT NULL,
    interval_type TEXT NOT NULL,
    cron_expression TEXT NOT NULL,
    is_active INTEGER DEFAULT 1,
    last_run_at TEXT,
    next_run_at TEXT,
    config_json TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_test_results_property_date ON test_results(property_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_test_results_status ON test_results(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_event_details_test_result ON event_details(test_result_id);
CREATE INDEX IF NOT EXISTS idx_event_details_anomaly ON event_details(is_anomaly, test_result_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_tasks_active ON scheduled_tasks(is_active, next_run_at);
CREATE INDEX IF NOT EXISTS idx_properties_favorite ON properties(is_favorite, created_at DESC);
