-- ============================================================================
-- CONSOLIDATED DATABASE MIGRATIONS
-- ============================================================================
-- This file consolidates all migrations from 001 through 014
-- Generated: 2026-02-19
-- ============================================================================

-- ============================================================================
-- MIGRATION 001: Add projects and AI-related tables
-- Created: 2025-11-27
-- Description: Adds projects, ai_requests, generated_tests, and execution_logs tables
-- ============================================================================

-- PROJECTS table (group API specs / files per user/team)
CREATE TABLE IF NOT EXISTS projects (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Request sent to AI for test generation
CREATE TABLE IF NOT EXISTS ai_requests (
    id SERIAL PRIMARY KEY,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    request_text TEXT NOT NULL,
    model_used VARCHAR(50) DEFAULT 'qwen3-coder:8b',
    status VARCHAR(20) DEFAULT 'pending',
    requested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- AI-generated test case(s)
CREATE TABLE IF NOT EXISTS generated_tests (
    id SERIAL PRIMARY KEY,
    ai_request_id INTEGER NOT NULL REFERENCES ai_requests(id) ON DELETE CASCADE,
    test_code TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Optional but useful: log execution of tests
CREATE TABLE IF NOT EXISTS execution_logs (
    id SERIAL PRIMARY KEY,
    ai_request_id INTEGER NOT NULL REFERENCES ai_requests(id) ON DELETE CASCADE,
    execution_status VARCHAR(20),
    execution_output TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_projects_user_id ON projects(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_requests_project_id ON ai_requests(project_id);
CREATE INDEX IF NOT EXISTS idx_ai_requests_status ON ai_requests(status);
CREATE INDEX IF NOT EXISTS idx_generated_tests_ai_request_id ON generated_tests(ai_request_id);
CREATE INDEX IF NOT EXISTS idx_execution_logs_ai_request_id ON execution_logs(ai_request_id);


-- ============================================================================
-- MIGRATION 002: Improve execution logs to track individual test cases
-- Created: 2025-12-03
-- Description: Modify execution_logs to store run-level metadata and add test_case_results table
-- ============================================================================

ALTER TABLE execution_logs 
    ADD COLUMN IF NOT EXISTS total_tests INTEGER,
    ADD COLUMN IF NOT EXISTS passed_count INTEGER,
    ADD COLUMN IF NOT EXISTS failed_count INTEGER,
    ADD COLUMN IF NOT EXISTS total_execution_time_ms INTEGER;

-- Create new table for individual test case results
CREATE TABLE IF NOT EXISTS test_case_results (
    id SERIAL PRIMARY KEY,
    execution_log_id INTEGER NOT NULL REFERENCES execution_logs(id) ON DELETE CASCADE,
    test_case_name VARCHAR(255) NOT NULL,
    test_case_category VARCHAR(50),  -- "Happy Path", "Edge Case", "Error Handling"
    test_case_description TEXT,
    status VARCHAR(20) NOT NULL,      -- "passed", "failed", "skipped", "error"
    execution_time_ms INTEGER,
    error_message TEXT,
    stack_trace TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_test_case_results_execution_log_id 
    ON test_case_results(execution_log_id);
CREATE INDEX IF NOT EXISTS idx_test_case_results_status 
    ON test_case_results(status);
CREATE INDEX IF NOT EXISTS idx_test_case_results_category 
    ON test_case_results(test_case_category);


-- ============================================================================
-- MIGRATION 003: Add function_name column to ai_requests
-- Created: 2025-12-09
-- Description: Store the user-entered function name for display
-- ============================================================================

ALTER TABLE ai_requests 
ADD COLUMN IF NOT EXISTS function_name VARCHAR(100);

-- Create index for function_name
CREATE INDEX IF NOT EXISTS idx_ai_requests_function_name ON ai_requests(function_name);


-- ============================================================================
-- MIGRATION 004: Add test scenarios table for granular test management
-- Created: 2025-12-10
-- Description: Enables individual editing, deletion, and management of test scenarios
-- ============================================================================

-- Main test scenarios table
CREATE TABLE IF NOT EXISTS test_scenarios (
    id SERIAL PRIMARY KEY,
    ai_request_id INTEGER NOT NULL REFERENCES ai_requests(id) ON DELETE CASCADE,
    
    -- Scenario metadata
    scenario_title VARCHAR(255) NOT NULL,
    scenario_description TEXT,
    scenario_category VARCHAR(50) CHECK (scenario_category IN ('Happy Path', 'Edge Case', 'Error Handling', 'User Story')),
    
    -- Code for this specific scenario
    scenario_code TEXT NOT NULL,
    
    -- Preserve original AI-generated code for reset functionality
    original_scenario_code TEXT,
    
    -- User interaction tracking
    enabled BOOLEAN DEFAULT TRUE,
    is_user_edited BOOLEAN DEFAULT FALSE,
    sort_order INTEGER DEFAULT 0,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Metadata for the entire test suite (shared setup code)
CREATE TABLE IF NOT EXISTS test_suite_metadata (
    ai_request_id INTEGER PRIMARY KEY REFERENCES ai_requests(id) ON DELETE CASCADE,
    
    language VARCHAR(50) NOT NULL,
    framework VARCHAR(50) NOT NULL,
    
    -- Shared code that goes at the top of the file
    imports TEXT,
    setup_code TEXT,
    teardown_code TEXT,
    
    summary TEXT,
    
    -- Preserve the config used during generation
    generated_with_config JSONB,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_test_scenarios_ai_request_id ON test_scenarios(ai_request_id);
CREATE INDEX IF NOT EXISTS idx_test_scenarios_enabled ON test_scenarios(ai_request_id, enabled);
CREATE INDEX IF NOT EXISTS idx_test_scenarios_sort_order ON test_scenarios(ai_request_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_test_scenarios_edited ON test_scenarios(is_user_edited);

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_test_scenario_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop trigger if exists before creating
DROP TRIGGER IF EXISTS test_scenarios_updated_at ON test_scenarios;

CREATE TRIGGER test_scenarios_updated_at
BEFORE UPDATE ON test_scenarios
FOR EACH ROW
EXECUTE FUNCTION update_test_scenario_timestamp();

-- Optional: Track edit history for auditing
CREATE TABLE IF NOT EXISTS scenario_edit_history (
    id SERIAL PRIMARY KEY,
    scenario_id INTEGER REFERENCES test_scenarios(id) ON DELETE CASCADE,
    previous_code TEXT NOT NULL,
    previous_title VARCHAR(255),
    edited_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Trigger to save edit history before updates
CREATE OR REPLACE FUNCTION save_scenario_edit_history()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.scenario_code <> NEW.scenario_code OR 
       OLD.scenario_title <> NEW.scenario_title THEN
        INSERT INTO scenario_edit_history (scenario_id, previous_code, previous_title)
        VALUES (OLD.id, OLD.scenario_code, OLD.scenario_title);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop trigger if exists before creating
DROP TRIGGER IF EXISTS scenario_history_trigger ON test_scenarios;

CREATE TRIGGER scenario_history_trigger
BEFORE UPDATE ON test_scenarios
FOR EACH ROW
EXECUTE FUNCTION save_scenario_edit_history();


-- ============================================================================
-- MIGRATION 005: Add secrets management infrastructure
-- Created: 2025-12-15
-- Description: Enables secure storage and management of environment secrets for integration testing
-- ============================================================================

-- Main secrets table
CREATE TABLE IF NOT EXISTS project_secrets (
    id SERIAL PRIMARY KEY,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    
    -- Secret metadata
    key_name VARCHAR(100) NOT NULL,
    description TEXT,
    
    -- Encrypted value (using Fernet symmetric encryption)
    -- Never retrieve via API/UI - write-only after creation
    encrypted_value TEXT NOT NULL,
    
    -- Audit fields
    created_by INTEGER REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_used_at TIMESTAMP,
    
    -- Enforce unique keys per project
    CONSTRAINT unique_project_secret UNIQUE (project_id, key_name),
    
    -- Enforce uppercase snake_case naming convention
    CONSTRAINT valid_key_name CHECK (key_name ~ '^[A-Z_][A-Z0-9_]*$')
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_project_secrets_project ON project_secrets(project_id);
CREATE INDEX IF NOT EXISTS idx_project_secrets_created_by ON project_secrets(created_by);

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_project_secrets_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop trigger if exists before creating
DROP TRIGGER IF EXISTS project_secrets_updated_at ON project_secrets;

CREATE TRIGGER project_secrets_updated_at
BEFORE UPDATE ON project_secrets
FOR EACH ROW
EXECUTE FUNCTION update_project_secrets_timestamp();

-- Optional: Audit log for secret access (for compliance)
CREATE TABLE IF NOT EXISTS secret_access_log (
    id SERIAL PRIMARY KEY,
    secret_id INTEGER REFERENCES project_secrets(id) ON DELETE CASCADE,
    accessed_by INTEGER REFERENCES users(id),
    access_type VARCHAR(20) CHECK (access_type IN ('created', 'deleted')),
    accessed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_secret_access_log_secret ON secret_access_log(secret_id);
CREATE INDEX IF NOT EXISTS idx_secret_access_log_user ON secret_access_log(accessed_by);


-- ============================================================================
-- MIGRATION 006: Add test_type column to execution_logs
-- Description: This column tracks whether each test execution was unit or integration
-- ============================================================================

DO $$
BEGIN
    -- Add column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'execution_logs' AND column_name = 'test_type'
    ) THEN
        ALTER TABLE execution_logs ADD COLUMN test_type VARCHAR(20) DEFAULT 'unit';
        RAISE NOTICE 'Added test_type column to execution_logs';
    ELSE
        RAISE NOTICE 'test_type column already exists';
    END IF;
END $$;

-- Create index if not exists
CREATE INDEX IF NOT EXISTS idx_execution_logs_test_type ON execution_logs(test_type);


-- ============================================================================
-- MIGRATION 007: Restore test queue table if deleted
-- Created: 2026-01-07
-- Description: Safely (re)create test_queue_items, indexes, and trigger when missing
-- ============================================================================

-- Ensure table exists
CREATE TABLE IF NOT EXISTS test_queue_items (
    id SERIAL PRIMARY KEY,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,

    -- Git metadata
    repo_url VARCHAR(500) NOT NULL,
    branch VARCHAR(100) NOT NULL,
    commit_hash VARCHAR(40) NOT NULL,
    commit_message TEXT,

    -- Author/requester info
    author_name VARCHAR(200),
    author_email VARCHAR(200),
    triggered_by INTEGER REFERENCES users(id),

    -- Code context
    file_list TEXT NOT NULL,
    diff_summary TEXT,

    -- Test execution context
    test_type VARCHAR(50),

    -- Status tracking
    status VARCHAR(20) NOT NULL DEFAULT 'pending',

    -- Generated artifacts and logs
    generated_tests_link TEXT,
    execution_logs_link TEXT,
    junit_report_link TEXT,
    error_message TEXT,

    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    started_at TIMESTAMP,
    completed_at TIMESTAMP,

    CONSTRAINT unique_pending_item UNIQUE (project_id, commit_hash, file_list)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_queue_project ON test_queue_items(project_id);
CREATE INDEX IF NOT EXISTS idx_queue_status ON test_queue_items(status);
CREATE INDEX IF NOT EXISTS idx_queue_branch ON test_queue_items(branch);
CREATE INDEX IF NOT EXISTS idx_queue_created ON test_queue_items(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_queue_commit ON test_queue_items(commit_hash);

-- Trigger function
CREATE OR REPLACE FUNCTION update_queue_item_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status = 'running' AND OLD.status = 'pending' THEN
        NEW.started_at = CURRENT_TIMESTAMP;
    END IF;

    IF NEW.status IN ('done', 'failed') AND OLD.status = 'running' THEN
        NEW.completed_at = CURRENT_TIMESTAMP;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop trigger if exists before creating
DROP TRIGGER IF EXISTS queue_item_timestamps ON test_queue_items;

CREATE TRIGGER queue_item_timestamps
BEFORE UPDATE ON test_queue_items
FOR EACH ROW
EXECUTE FUNCTION update_queue_item_timestamp();


-- ============================================================================
-- MIGRATION 008: Add GitHub repository URL to projects
-- Created: (not specified)
-- Purpose: Store GitHub repo URL for webhook and commit fetching
-- ============================================================================

-- Add github_repo_url column if it doesn't exist
ALTER TABLE projects
ADD COLUMN IF NOT EXISTS github_repo_url VARCHAR(255);

-- Add index for efficient lookups
CREATE INDEX IF NOT EXISTS idx_projects_github_repo_url ON projects(github_repo_url);


-- ============================================================================
-- MIGRATION 009: Add tested files tracking to queue items
-- Created: 2026-01-13
-- Description: Add column to track which files have been tested in multi-file commits
-- ============================================================================

-- Add tested_files column to test_queue_items if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'test_queue_items' AND column_name = 'tested_files'
  ) THEN
    ALTER TABLE test_queue_items ADD COLUMN tested_files TEXT DEFAULT '[]';
  END IF;
END $$;

-- Add index for status to improve query performance
CREATE INDEX IF NOT EXISTS idx_queue_status_created ON test_queue_items(status, created_at DESC);


-- ============================================================================
-- MIGRATION 010: Add baseline timestamp for GitHub integration
-- Created: (not specified)
-- Description: This tracks when the repo was connected to filter out old commits
-- ============================================================================

ALTER TABLE projects
ADD COLUMN IF NOT EXISTS github_baseline_timestamp TIMESTAMP;

-- Add index for efficient timestamp filtering
CREATE INDEX IF NOT EXISTS idx_projects_github_baseline 
ON projects(github_baseline_timestamp);

-- Add comment for documentation
COMMENT ON COLUMN projects.github_baseline_timestamp IS 'Timestamp when GitHub repo was connected - used to filter commits';


-- ============================================================================
-- MIGRATION 011: Add dependency persistence columns
-- Created: (not specified)
-- Description: Adds columns for storing requirements and custom dependencies
-- ============================================================================

ALTER TABLE test_suite_metadata 
ADD COLUMN IF NOT EXISTS requirements_text TEXT,
ADD COLUMN IF NOT EXISTS custom_deps_xml TEXT;


-- ============================================================================
-- MIGRATION 012: Add execution_logs_map column to test_queue_items
-- Created: (not specified)
-- Description: Track execution_log_id per file in format: {"file1.py": 123, "file2.py": 124}
-- ============================================================================

ALTER TABLE test_queue_items
ADD COLUMN IF NOT EXISTS execution_logs_map TEXT DEFAULT '{}';

-- Create index for queries
CREATE INDEX IF NOT EXISTS idx_test_queue_items_execution_logs_map 
ON test_queue_items USING GIN ((execution_logs_map::jsonb));


-- ============================================================================
-- MIGRATION 013: Add git_provider column to projects
-- Created: (not specified)
-- Description: Store 'github' or 'gitlab' to support multiple git providers
-- ============================================================================

ALTER TABLE projects
ADD COLUMN IF NOT EXISTS git_provider VARCHAR(20) DEFAULT 'github';

-- Create index for queries
CREATE INDEX IF NOT EXISTS idx_projects_git_provider ON projects(git_provider);


-- ============================================================================
-- MIGRATION 014: Add performance indexes - CORRECTED VERSION
-- Created: 2026-02-19
-- Description: Add indexes for commonly queried columns and foreign keys (with fixes for non-existent columns)
-- ============================================================================

-- ========================================
-- Additional Indexes for Performance
-- ========================================

-- Projects table
CREATE INDEX IF NOT EXISTS idx_projects_created_at ON projects(created_at DESC);

-- AI Requests (uses requested_at not created_at)
CREATE INDEX IF NOT EXISTS idx_ai_requests_requested_at ON ai_requests(requested_at DESC);

-- Generated Tests
CREATE INDEX IF NOT EXISTS idx_generated_tests_created_at ON generated_tests(created_at DESC);

-- Execution Logs
CREATE INDEX IF NOT EXISTS idx_execution_logs_created_at ON execution_logs(created_at DESC);

-- Test scenarios
CREATE INDEX IF NOT EXISTS idx_test_scenarios_created_at ON test_scenarios(created_at DESC);

-- Test queue items
CREATE INDEX IF NOT EXISTS idx_queue_pending ON test_queue_items(status, created_at ASC) WHERE status = 'pending';

-- Analyze tables for query optimization
ANALYZE projects;
ANALYZE generated_tests;
ANALYZE execution_logs;
ANALYZE test_queue_items;
ANALYZE test_scenarios;
ANALYZE users;

-- Log completion
DO $$
BEGIN
    RAISE NOTICE 'All migrations completed successfully';
END $$;


-- ============================================================================
-- END OF CONSOLIDATED MIGRATIONS
-- ============================================================================
-- Total Migrations: 15 (001-014)
-- Last Update: 2026-02-19 (Fixed problematic indexes)
-- ============================================================================
