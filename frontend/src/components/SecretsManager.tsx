import React, { useState, useEffect, useCallback } from 'react';
import { Button } from './ui/Button';
import { useTheme } from '../context/ThemeContext';

interface Secret {
    id: number;
    key_name: string;
    value_masked: string;
    description: string;
    created_at: string;
    last_used_at: string | null;
}

interface SecretsManagerProps {
    projectId: number;
}

const SecretsManager: React.FC<SecretsManagerProps> = ({ projectId }) => {
    const { theme } = useTheme();
    const isDark = theme === 'dark';
    const [secrets, setSecrets] = useState<Secret[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    // Add secret form state
    const [showAddForm, setShowAddForm] = useState(false);
    const [newSecret, setNewSecret] = useState({
        key_name: '',
        value: '',
        description: ''
    });

    const getErrorMessage = (err: unknown, fallback: string) =>
        err instanceof Error ? err.message : fallback;

    const fetchSecrets = useCallback(async () => {
        try {
            setLoading(true);
            const response = await fetch(`/api/projects/${projectId}/secrets`, {
                credentials: 'include'
            });

            if (!response.ok) throw new Error('Failed to fetch secrets');

            const data = await response.json();
            setSecrets(data.secrets || []);
            setError('');
        } catch (err: unknown) {
            setError(getErrorMessage(err, 'Failed to fetch secrets'));
        } finally {
            setLoading(false);
        }
    }, [projectId]);

    // Fetch secrets
    useEffect(() => {
        fetchSecrets();
    }, [fetchSecrets]);

    const handleAddSecret = async () => {
        // Validation
        const keyRegex = /^[A-Z_][A-Z0-9_]*$/;
        if (!keyRegex.test(newSecret.key_name)) {
            setError('Key name must match pattern: ^[A-Z_][A-Z0-9_]*$ (e.g., DATABASE_URL)');
            return;
        }

        if (!newSecret.value) {
            setError('Value is required');
            return;
        }

        try {
            const response = await fetch(`/api/projects/${projectId}/secrets`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify(newSecret)
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || 'Failed to create secret');
            }

            // Reset form
            setNewSecret({ key_name: '', value: '', description: '' });
            setShowAddForm(false);
            setError('');

            // Refresh list
            fetchSecrets();
        } catch (err: unknown) {
            setError(getErrorMessage(err, 'Failed to create secret'));
        }
    };

    const handleDeleteSecret = async (keyName: string) => {
        if (!confirm(`Delete secret ${keyName}? This cannot be undone.`)) return;

        try {
            const response = await fetch(`/api/projects/${projectId}/secrets/${keyName}`, {
                method: 'DELETE',
                credentials: 'include'
            });

            if (!response.ok) throw new Error('Failed to delete secret');

            fetchSecrets();
        } catch (err: unknown) {
            setError(getErrorMessage(err, 'Failed to delete secret'));
        }
    };

    return (
        <div style={{
            background: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(15, 23, 42, 0.03)',
            border: isDark ? '1px solid rgba(255, 255, 255, 0.1)' : '1px solid rgba(15, 23, 42, 0.1)',
            borderRadius: '16px',
            padding: '1.5rem',
            color: isDark ? '#fff' : '#0F172A'
        }}>
            {/* Header */}
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '1.5rem'
            }}>
                <div>
                    <h2 style={{ fontSize: '1.5rem', fontWeight: 600, marginBottom: '0.5rem' }}>
                        🔐 Project Secrets
                    </h2>
                    <p style={{ fontSize: '0.875rem', color: isDark ? '#9CA3AF' : '#64748B' }}>
                        Manage encrypted environment variables for integration tests
                    </p>
                </div>

                {!showAddForm && (
                    <Button
                        onClick={() => setShowAddForm(true)}
                        variant="primary"
                        size="md"
                    >
                        + Add Secret
                    </Button>
                )}
            </div>

            {/* Warning Banner */}
            <div style={{
                background: isDark ? 'rgba(245, 158, 11, 0.1)' : 'rgba(245, 158, 11, 0.08)',
                border: isDark ? '1px solid rgba(245, 158, 11, 0.3)' : '1px solid rgba(245, 158, 11, 0.25)',
                borderRadius: '8px',
                padding: '1rem',
                marginBottom: '1.5rem',
                fontSize: '0.875rem',
                color: isDark ? '#FCD34D' : '#B45309'
            }}>
                ⚠️ <strong>Write-Only:</strong> Secret values can never be retrieved after creation.
                You can only view masked values. Store secrets securely elsewhere.
            </div>

            {/* Error Message */}
            {error && (
                <div style={{
                    background: isDark ? 'rgba(239, 68, 68, 0.1)' : 'rgba(239, 68, 68, 0.08)',
                    border: isDark ? '1px solid rgba(239, 68, 68, 0.3)' : '1px solid rgba(239, 68, 68, 0.25)',
                    borderRadius: '8px',
                    padding: '1rem',
                    marginBottom: '1.5rem',
                    color: isDark ? '#EF4444' : '#DC2626'
                }}>
                    {error}
                </div>
            )}

            {/* Add Secret Form */}
            {showAddForm && (
                <div style={{
                    background: isDark ? 'rgba(255, 255, 255, 0.03)' : 'rgba(15, 23, 42, 0.02)',
                    border: isDark ? '1px solid rgba(255, 255, 255, 0.1)' : '1px solid rgba(15, 23, 42, 0.1)',
                    borderRadius: '12px',
                    padding: '1.5rem',
                    marginBottom: '1.5rem'
                }}>
                    <h3 style={{ fontSize: '1.125rem', fontWeight: 600, marginBottom: '1rem', color: isDark ? '#fff' : '#0F172A' }}>
                        Add New Secret
                    </h3>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        <div>
                            <label style={{ fontSize: '0.875rem', color: isDark ? '#9CA3AF' : '#64748B', display: 'block', marginBottom: '0.5rem' }}>
                                Key Name (e.g., DATABASE_URL)
                            </label>
                            <input
                                type="text"
                                value={newSecret.key_name}
                                onChange={(e) => setNewSecret({ ...newSecret, key_name: e.target.value.toUpperCase() })}
                                placeholder="DATABASE_URL"
                                style={{
                                    width: '100%',
                                    padding: '0.75rem',
                                    background: isDark ? 'rgba(255, 255, 255, 0.05)' : '#ffffff',
                                    border: isDark ? '1px solid rgba(255, 255, 255, 0.1)' : '1px solid rgba(15, 23, 42, 0.1)',
                                    borderRadius: '8px',
                                    color: isDark ? '#fff' : '#0F172A',
                                    fontSize: '0.875rem'
                                }}
                            />
                        </div>

                        <div>
                            <label style={{ fontSize: '0.875rem', color: isDark ? '#9CA3AF' : '#64748B', display: 'block', marginBottom: '0.5rem' }}>
                                Value (will be encrypted)
                            </label>
                            <input
                                type="password"
                                value={newSecret.value}
                                onChange={(e) => setNewSecret({ ...newSecret, value: e.target.value })}
                                placeholder="Enter secret value"
                                style={{
                                    width: '100%',
                                    padding: '0.75rem',
                                    background: isDark ? 'rgba(255, 255, 255, 0.05)' : '#ffffff',
                                    border: isDark ? '1px solid rgba(255, 255, 255, 0.1)' : '1px solid rgba(15, 23, 42, 0.1)',
                                    borderRadius: '8px',
                                    color: isDark ? '#fff' : '#0F172A',
                                    fontSize: '0.875rem'
                                }}
                            />
                        </div>

                        <div>
                            <label style={{ fontSize: '0.875rem', color: isDark ? '#9CA3AF' : '#64748B', display: 'block', marginBottom: '0.5rem' }}>
                                Description (optional)
                            </label>
                            <input
                                type="text"
                                value={newSecret.description}
                                onChange={(e) => setNewSecret({ ...newSecret, description: e.target.value })}
                                placeholder="What is this secret for?"
                                style={{
                                    width: '100%',
                                    padding: '0.75rem',
                                    background: isDark ? 'rgba(255, 255, 255, 0.05)' : '#ffffff',
                                    border: isDark ? '1px solid rgba(255, 255, 255, 0.1)' : '1px solid rgba(15, 23, 42, 0.1)',
                                    borderRadius: '8px',
                                    color: isDark ? '#fff' : '#0F172A',
                                    fontSize: '0.875rem'
                                }}
                            />
                        </div>

                        <div style={{ display: 'flex', gap: '0.75rem' }}>
                            <Button
                                onClick={handleAddSecret}
                                variant="primary"
                                size="md"
                            >
                                Save Secret
                            </Button>
                            <Button
                                onClick={() => {
                                    setShowAddForm(false);
                                    setNewSecret({ key_name: '', value: '', description: '' });
                                    setError('');
                                }}
                                variant="ghost"
                                size="md"
                            >
                                Cancel
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            {/* Secrets List */}
            {loading ? (
                <div style={{ textAlign: 'center', padding: '2rem', color: isDark ? '#9CA3AF' : '#64748B' }}>
                    Loading secrets...
                </div>
            ) : secrets.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '2rem', color: isDark ? '#9CA3AF' : '#64748B' }}>
                    No secrets configured. Add your first secret to enable integration testing.
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    {secrets.map((secret) => (
                        <div
                            key={secret.id}
                            style={{
                                background: isDark ? 'rgba(255, 255, 255, 0.03)' : 'rgba(15, 23, 42, 0.02)',
                                border: isDark ? '1px solid rgba(255, 255, 255, 0.1)' : '1px solid rgba(15, 23, 42, 0.1)',
                                borderRadius: '8px',
                                padding: '1rem',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center'
                            }}
                        >
                            <div style={{ flex: 1 }}>
                                <div style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.25rem', color: isDark ? '#fff' : '#0F172A' }}>
                                    {secret.key_name}
                                </div>
                                <div style={{ fontSize: '0.75rem', color: isDark ? '#6B7280' : '#78716C', fontFamily: 'monospace' }}>
                                    {secret.value_masked}
                                </div>
                                {secret.description && (
                                    <div style={{ fontSize: '0.75rem', color: isDark ? '#9CA3AF' : '#64748B', marginTop: '0.25rem' }}>
                                        {secret.description}
                                    </div>
                                )}
                            </div>

                            <Button
                                onClick={() => handleDeleteSecret(secret.key_name)}
                                variant="destructive"
                                size="sm"
                            >
                                Delete
                            </Button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default SecretsManager;
