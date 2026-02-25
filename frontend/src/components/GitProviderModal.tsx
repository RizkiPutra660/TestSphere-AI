import { useState } from 'react';
import { Github } from 'lucide-react';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { useTheme } from '../context/ThemeContext';

interface GitProviderModalProps {
  onClose: () => void;
  onProceed: (provider: 'github' | 'gitlab', repoUrl: string) => void;
}

const GitProviderModal = ({ onClose, onProceed }: GitProviderModalProps) => {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const [selectedProvider, setSelectedProvider] = useState<'github' | 'gitlab' | null>(null);
  const [repoUrl, setRepoUrl] = useState('');

  const handleProceed = () => {
    if (!selectedProvider || !repoUrl.trim()) {
      return;
    }
    onProceed(selectedProvider, repoUrl.trim());
  };

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      title="Select Git Provider"
      maxWidth="md"
    >
      {/* Provider Selection */}
      <div className="mb-6">
        <p className={`${isDark ? 'text-gray-400' : 'text-gray-700'} text-sm mb-4`}>Choose your Git hosting platform:</p>
        <div className="grid grid-cols-2 gap-4">
          {/* GitHub Option */}
          <button
            onClick={() => setSelectedProvider('github')}
            className={`p-6 rounded-lg border-2 transition-all ${
              selectedProvider === 'github'
                ? isDark
                  ? 'border-indigo-500 bg-indigo-500/10'
                  : 'border-indigo-500 bg-indigo-50'
                : isDark
                ? 'border-white/10 bg-[#0B0F19] hover:border-indigo-500/50'
                : 'border-gray-200 bg-white hover:border-indigo-200'
            }`}
          >
            <div className="flex flex-col items-center gap-3">
              <Github className={`w-12 h-12 ${isDark ? 'text-white' : 'text-gray-900'}`} />
              <span className={`${isDark ? 'text-white' : 'text-gray-900'} font-semibold`}>GitHub</span>
            </div>
          </button>

          {/* GitLab Option */}
          <button
            onClick={() => setSelectedProvider('gitlab')}
            className={`p-6 rounded-lg border-2 transition-all ${
              selectedProvider === 'gitlab'
                ? isDark
                  ? 'border-indigo-500 bg-indigo-500/10'
                  : 'border-indigo-500 bg-indigo-50'
                : isDark
                ? 'border-white/10 bg-[#0B0F19] hover:border-indigo-500/50'
                : 'border-gray-200 bg-white hover:border-indigo-200'
            }`}
          >
            <div className="flex flex-col items-center gap-3">
              <svg className={`w-12 h-12 ${isDark ? '' : 'text-gray-900'}`} viewBox="0 0 24 24" fill="currentColor">
                <path fill="#FC6D26" d="M23.546 10.93L13.667.452a1.037 1.037 0 00-1.735.326L9.018 9.452H.984a1.037 1.037 0 00-.77 1.63l11.095 10.36a1.037 1.037 0 001.396-.05l10.84-9.99a1.037 1.037 0 00.001-1.472z"/>
              </svg>
              <span className={`${isDark ? 'text-white' : 'text-gray-900'} font-semibold`}>GitLab</span>
            </div>
          </button>
        </div>
      </div>

      {/* Repository URL Input */}
      {selectedProvider && (
        <div className="mb-6">
          <label className={`block text-sm font-medium mb-2 ${isDark ? 'text-gray-400' : 'text-gray-700'}`}>
            Repository URL
          </label>
          <input
            type="text"
            value={repoUrl}
            onChange={(e) => setRepoUrl(e.target.value)}
            placeholder={
              selectedProvider === 'github'
                ? 'https://github.com/owner/repo'
                : 'https://gitlab.com/owner/repo'
            }
            className={`w-full px-4 py-3 rounded-lg placeholder-gray-500 focus:outline-none focus:border-indigo-500 ${
              isDark
                ? 'bg-[#0B0F19] border border-white/10 text-white'
                : 'bg-white border border-gray-300 text-gray-900'
            }`}
          />
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex gap-3 justify-end">
        <Button
          onClick={onClose}
          variant="secondary"
          size="md"
        >
          Cancel
        </Button>
        <Button
          onClick={handleProceed}
          disabled={!selectedProvider || !repoUrl.trim()}
          variant="primary"
          size="md"
        >
          Proceed
        </Button>
      </div>
    </Modal>
  );
};

export default GitProviderModal;
