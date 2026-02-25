-- Enable UUID extension if needed
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create users table
-- CREATE TABLE IF NOT EXISTS users (
--     id SERIAL PRIMARY KEY,
--     email VARCHAR(100) UNIQUE NOT NULL,
--     username VARCHAR(50) UNIQUE,
--     role VARCHAR(20) DEFAULT 'user',
--     email_verified BOOLEAN DEFAULT false,
--     avatar_url VARCHAR(255),
--     last_login TIMESTAMP,
--     created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
--     updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
--     is_active BOOLEAN DEFAULT TRUE
-- );

CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    role VARCHAR(20) DEFAULT 'user',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_login TIMESTAMP,
    is_active BOOLEAN DEFAULT TRUE
);
-- Create user_credentials table
CREATE TABLE IF NOT EXISTS user_credentials (
    credential_id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    password_updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- -- Insert sample data
-- INSERT INTO users (id, email, username, role) VALUES 
-- (1, 'admin@example.com', 'admin', 'admin'),
-- (2, 'john@example.com', 'john_doe', 'user'),
-- (3, 'jane@example.com', 'jane_smith', 'moderator')
-- ON CONFLICT (email) DO NOTHING;

-- Insert sample data
-- INSERT INTO users (username, email, role) VALUES 
-- ('admin', 'admin@example.com', 'admin'),
-- ('john_doe', 'john@example.com', 'user'),
-- ('jane_smith', 'jane@example.com', 'moderator')
-- ON CONFLICT (username) DO NOTHING;


-- Insert credentials
-- INSERT INTO user_credentials (credential_id, user_id, password_hash) VALUES 
-- (1, 1, '$2b$12$ZhVvsHQB9qke/KL4XFnZ8eSQrOxODyMFz59OWxZYnOlBv8qv6Wkj.'),
-- (2, 2, '$2b$12$qbyxtR4i9r.YzhO/b/tx/.azK5LoK3g3ubrIxxUI1AXjpLXS2XF4m'),
-- (3, 3, '$2b$12$gRouipVaAZ9vfIu8CfyqTOptVCMGJ5cVpG6MRv4xe9Zl23viRHFSa')
-- ON CONFLICT (credential_id) DO NOTHING;
-- -- Insert credentials
-- INSERT INTO user_credentials (credential_id, user_id, password_hash) VALUES 
-- (1, 1, '$2b$12$ZhVvsHQB9qke/KL4XFnZ8eSQrOxODyMFz59OWxZYnOlBv8qv6Wkj.'),
-- (2, 2, '$2b$12$qbyxtR4i9r.YzhO/b/tx/.azK5LoK3g3ubrIxxUI1AXjpLXS2XF4m'),
-- (3, 3, '$2b$12$gRouipVaAZ9vfIu8CfyqTOptVCMGJ5cVpG6MRv4xe9Zl23viRHFSa')
-- ON CONFLICT (credential_id) DO NOTHING;


-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_created_at ON users(created_at);

-- Create a function to update last_login
CREATE OR REPLACE FUNCTION update_last_login()
RETURNS TRIGGER AS $$
BEGIN
    NEW.last_login = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;