import React, { useState } from 'react';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';

interface GitHubRepoModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: number;
  projectName: string;
  onSuccess: (repoUrl: string) => void;
  existingRepoUrl?: string;
}

export const GitHubRepoModal: React.FC<GitHubRepoModalProps> = ({
  isOpen,
  onClose,
  projectId,
  projectName,
  onSuccess,
  existingRepoUrl
}) => {
  const [repoUrl, setRepoUrl] = useState(existingRepoUrl || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await fetch(
        `/api/projects/${projectId}/github-repo`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('access_token')}`
          },
          body: JSON.stringify({ repo_url: repoUrl })
        }
      );

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to set GitHub repository');
      }

      onSuccess(repoUrl);
      setRepoUrl('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Connect GitHub Repository"
      maxWidth="md"
    >
      <div className="mb-4">
        <p className="text-sm text-gray-400">
          Project: <strong className="text-white">{projectName}</strong>
        </p>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Repository URL
          </label>
          <input
            type="url"
            value={repoUrl}
            onChange={(e) => setRepoUrl(e.target.value)}
            placeholder="https://github.com/username/repo"
            disabled={loading}
            required
            className="w-full px-3 py-2 bg-black/30 border border-white/10 rounded-lg text-white text-sm outline-none focus:border-indigo-500 transition-colors disabled:opacity-50"
          />
          <p className="mt-2 text-xs text-gray-500">
            Example: https://github.com/username/repository
          </p>
        </div>

        {error && (
          <div className="mb-6 px-3 py-2 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
            {error}
          </div>
        )}

        <div className="flex gap-4 justify-end">
          <Button
            type="button"
            onClick={onClose}
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
            {loading ? 'Saving...' : 'Connect Repository'}
          </Button>
        </div>
      </form>
    </Modal>
  );
};
