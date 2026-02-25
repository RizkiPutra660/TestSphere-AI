import React, { useState, useEffect, useCallback } from 'react';
import { Key } from 'lucide-react';

interface Secret {
    id: number;
    key_name: string;
    value_masked: string;
    description: string;
}

interface SecretsSelectorProps {
    projectId: number;
    selected: string[];
    onChange: (selected: string[]) => void;
}

const SecretsSelector: React.FC<SecretsSelectorProps> = ({ projectId, selected, onChange }) => {
    const [secrets, setSecrets] = useState<Secret[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchSecrets = useCallback(async () => {
        try {
            setLoading(true);
            const response = await fetch(`/api/projects/${projectId}/secrets`, {
                credentials: 'include'
            });

            if (response.ok) {
                const data = await response.json();
                setSecrets(data.secrets || []);
            }
        } catch {
            setSecrets([]);
        } finally {
            setLoading(false);
        }
    }, [projectId]);

    useEffect(() => {
        fetchSecrets();
    }, [fetchSecrets]);

    const toggleSecret = (keyName: string) => {
        if (selected.includes(keyName)) {
            onChange(selected.filter(k => k !== keyName));
        } else {
            onChange([...selected, keyName]);
        }
    };

    if (loading) {
        return (
            <div style={{
                textAlign: 'center',
                padding: '1rem',
                color: '#9CA3AF',
                fontSize: '0.875rem'
            }}>
                Loading secrets...
            </div>
        );
    }

    if (secrets.length === 0) {
        return (
            <div style={{
                padding: '1rem',
                background: 'rgba(245, 158, 11, 0.1)',
                border: '1px solid rgba(245, 158, 11, 0.3)',
                borderRadius: '8px',
                fontSize: 'Q.875rem',
                color: '#FCD34D'
            }}>
                ⚠️ No secrets configured. Create secrets in Dashboard → Manage Secrets first.
            </div>
        );
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {secrets.map((secret) => (
                <label
                    key={secret.id}
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        padding: '0.75rem',
                        background: selected.includes(secret.key_name)
                            ? 'rgba(99, 102, 241, 0.1)'
                            : 'rgba(255, 255, 255, 0.03)',
                        border: `1px solid ${selected.includes(secret.key_name)
                            ? 'rgba(99, 102, 241, 0.3)'
                            : 'rgba(255, 255, 255, 0.1)'}`,
                        borderRadius: '8px',
                        cursor: 'pointer',
                        transition: 'all 0.2s'
                    }}
                >
                    <input
                        type="checkbox"
                        checked={selected.includes(secret.key_name)}
                        onChange={() => toggleSecret(secret.key_name)}
                        style={{
                            marginRight: '0.75rem',
                            width: '18px',
                            height: '18px',
                            cursor: 'pointer'
                        }}
                    />
                    <div style={{ flex: 1 }}>
                        <div style={{
                            fontSize: '0.875rem',
                            fontWeight: 600,
                            color: '#fff',
                            marginBottom: '0.25rem'
                        }}>
                            <Key size={14} style={{ display: 'inline', marginRight: '0.5rem' }} />
                            {secret.key_name}
                        </div>
                        {secret.description && (
                            <div style={{ fontSize: '0.75rem', color: '#9CA3AF' }}>
                                {secret.description}
                            </div>
                        )}
                    </div>
                </label>
            ))}
        </div>
    );
};

export default SecretsSelector;
