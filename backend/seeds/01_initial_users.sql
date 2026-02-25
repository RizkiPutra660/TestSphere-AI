-- Initial seed data for development
INSERT INTO users (id, email, username, role) VALUES 
(1, 'admin@example.com', 'admin', 'admin'),
(2, 'john@example.com', 'john_doe', 'user'),
(3, 'jane@example.com', 'jane_smith', 'moderator')
ON CONFLICT (email) DO NOTHING;

INSERT INTO user_credentials (credential_id, user_id, password_hash) VALUES 
(1, 1, '$2b$12$ZhVvsHQB9qke/KL4XFnZ8eSQrOxODyMFz59OWxZYnOlBv8qv6Wkj.'),
(2, 2, '$2b$12$qbyxtR4i9r.YzhO/b/tx/.azK5LoK3g3ubrIxxUI1AXjpLXS2XF4m'),
(3, 3, '$2b$12$gRouipVaAZ9vfIu8CfyqTOptVCMGJ5cVpG6MRv4xe9Zl23viRHFSa')
ON CONFLICT (credential_id) DO UPDATE SET password_hash = EXCLUDED.password_hash;

-- Reset sequences
SELECT setval('users_id_seq', (SELECT MAX(id) FROM users));
SELECT setval('user_credentials_credential_id_seq', (SELECT MAX(credential_id) FROM user_credentials));