import { useState } from 'react';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { useTheme } from '../context/ThemeContext';

interface Project {
    id: number;
    name: string;
    description: string | null;
    created_at: string | null;
}

interface CreateProjectModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: (project: Project) => void;
    // userId removed - will be extracted from JWT token on backend
}

export function CreateProjectModal({ isOpen, onClose, onSuccess }: CreateProjectModalProps) {
    const { theme } = useTheme();
    const isDark = theme === 'dark';
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!name.trim()) {
            setError('Project name is required');
            return;
        }

        setLoading(true);
        setError(null);

        try {
            // Updated to use relative path (proxy) and cookie auth
            const response = await fetch('/api/projects', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                credentials: 'include', // Send HTTP-only cookie
                body: JSON.stringify({
                    name: name.trim(),
                    description: description.trim()
                })
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || 'Failed to create project');
            }

            const project = await response.json();

            // Success - reset form and close modal
            setName('');
            setDescription('');
            onSuccess(project);
            onClose();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to create project');
        } finally {
            setLoading(false);
        }
    };

    const handleClose = () => {
        if (!loading) {
            setName('');
            setDescription('');
            setError(null);
            onClose();
        }
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={handleClose}
            title="Create a New Project"
            maxWidth="md"
        >
            <form onSubmit={handleSubmit}>
                {/* Project Name */}
                <div className="mb-6">
                    <label className={`block text-sm font-medium mb-2 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                        Project Name:
                    </label>
                    <input
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        maxLength={100}
                        placeholder="Enter project name"
                        disabled={loading}
                        className={`w-full px-3 py-2 rounded-lg text-sm focus:outline-none transition-colors disabled:opacity-50 ${
                            isDark
                                ? 'bg-black/30 border border-white/10 text-white focus:border-indigo-500'
                                : 'bg-white border border-gray-300 text-gray-900 focus:border-indigo-500'
                        }`}
                    />
                </div>

                {/* Description */}
                <div className="mb-6">
                    <label className={`block text-sm font-medium mb-2 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                        Description:
                    </label>
                    <textarea
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder="Enter project description (optional)"
                        disabled={loading}
                        rows={4}
                        className={`w-full px-3 py-2 rounded-lg text-sm focus:outline-none transition-colors resize-vertical disabled:opacity-50 ${
                            isDark
                                ? 'bg-black/30 border border-white/10 text-white focus:border-indigo-500'
                                : 'bg-white border border-gray-300 text-gray-900 focus:border-indigo-500'
                        }`}
                    />
                </div>

                {/* Error Message */}
                {error && (
                    <div className="px-3 py-2 bg-red-500/10 border border-red-500/30 rounded-lg text-red-500 text-sm mb-6">
                        {error}
                    </div>
                )}

                {/* Buttons */}
                <div className="flex gap-4 justify-end">
                    <Button
                        type="button"
                        onClick={handleClose}
                        disabled={loading}
                        variant="ghost"
                        size="md"
                    >
                        Cancel
                    </Button>
                    <Button
                        type="submit"
                        disabled={loading}
                        variant="primary"
                        size="md"
                    >
                        {loading ? 'Creating...' : 'Create Project'}
                    </Button>
                </div>
            </form>
        </Modal>
    );
}