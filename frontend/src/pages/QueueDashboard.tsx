import { useState, useEffect, useCallback } from 'react';
import { ArrowLeft, GitCommit, GitBranch, FileCode, User, Calendar, Github } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router';
import { useTheme } from '../context/ThemeContext';
import { usePersistedLocationState } from '../hooks/usePersistedLocationState';
import { filterTestableFiles, getProgressText } from '../utils/fileUtils';
import { formatTimeAgo, formatStatus } from '../utils/formatters';
import { StatusBadge } from "../components/ui/StatusBadge";
import { CompactPagination } from "../components/ui/Pagination";
import { TableEmptyState } from "../components/ui/EmptyState";
import { DeleteButton } from "../components/ui/IconButton";

type QueueStatus = 'pending' | 'running' | 'done' | 'failed';

type QueueDashboardState = {
  projectId?: number;
  gitProvider?: 'github' | 'gitlab';
  repoUrl?: string;
};

interface QueueItem {
  id: number;
  project_id: number;
  repo_url: string;
  branch: string;
  commit_hash: string;
  commit_message: string | null;
  author_name: string | null;
  author_email: string | null;
  file_list: string[];
  tested_files?: string[] | string | null;
  execution_logs_map?: Record<string, number> | string | null;
  diff_summary: string | null;
  test_type: string | null;
  status: string;
  generated_tests_link: string | null;
  execution_logs_link: string | null;
  junit_report_link: string | null;
  error_message: string | null;
  created_at: string | null;
  started_at: string | null;
  completed_at: string | null;
}

interface Pagination {
  page: number;
  perPage: number;
  count: number;
}

type ResultItem = {
  id: number;
  test_case_name: string;
  test_case_description?: string | null;
  status: string;
  execution_time_ms: number;
  code?: string | null;
  error_message?: string | null;
};

const QueueDashboard = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { colors, theme } = useTheme();
  const [items, setItems] = useState<QueueItem[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<QueueStatus | 'all'>('pending');
  const [runningTests, setRunningTests] = useState<Set<number>>(new Set());
  const [githubRepoUrl, setGithubRepoUrl] = useState<string | null>(null);
  const [editingRepoUrl, setEditingRepoUrl] = useState(false);
  const [repoUrlInput, setRepoUrlInput] = useState('');
  const [savingRepoUrl, setSavingRepoUrl] = useState(false);
  const [syncingCommits, setSyncingCommits] = useState(false);
  const [deleteDialog, setDeleteDialog] = useState<{ id: number; hash: string } | null>(null);
  const [fileSelectDialog, setFileSelectDialog] = useState<{ item: QueueItem; files: string[] } | null>(null);
  const [continueTestDialog, setContinueTestDialog] = useState<{ item: QueueItem; testedFiles: string[]; remainingFiles: string[] } | null>(null);
  const [viewResultsDialog, setViewResultsDialog] = useState<{ item: QueueItem; testedFiles: string[]; executionLogsMap: Record<string, number> } | null>(null);
  const itemsPerPage = 5;

  // Get project ID and Git provider info from state
  const state = usePersistedLocationState<QueueDashboardState>('queueDashboard') ?? (location.state as QueueDashboardState | null);
  const projectId = state?.projectId;
  const initialGitProvider = state?.gitProvider || 'github'; // from modal
  const initialRepoUrl = state?.repoUrl;
  
  // Store git provider in state (will be updated from backend if available)
  const [gitProvider, setGitProvider] = useState<'github' | 'gitlab'>(initialGitProvider);

  // Helper to normalize tested_files from backend (can be array, JSON string, or null)
  const normalizeTestedFiles = (testedFiles: string[] | string | null | undefined): string[] => {
    if (Array.isArray(testedFiles)) return testedFiles;
    if (typeof testedFiles === 'string') {
      try {
        const parsed = JSON.parse(testedFiles);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    }
    return [];
  };

  const fetchQueueItems = useCallback(async () => {
    try {
      setLoading(true);
      setItems([]); // Clear items immediately to avoid showing stale data
      const statusParam = statusFilter === 'all' ? 'all' : statusFilter;
      // Filter by project if projectId is available
      const projectParam = projectId ? `&project_id=${projectId}` : '';
      const url = `/api/test-items?status=${statusParam}&page=${currentPage}&per_page=${itemsPerPage}${projectParam}`;

      const response = await fetch(url, {
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch queue items');
      }

      const data = await response.json();
      setItems(data.items || []);
      setPagination(data.pagination || null);
      setError(null);
    } catch {
      setError('Unable to load queue items');
    } finally {
      setLoading(false);
    }
  }, [currentPage, itemsPerPage, projectId, statusFilter]);

  const saveGitHubRepoUrl = async () => {
    if (!projectId || !repoUrlInput.trim()) {
      setError('Invalid repo URL');
      return;
    }

    try {
      setSavingRepoUrl(true);
      const response = await fetch(`/api/projects/${projectId}/github-repo`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ repo_url: repoUrlInput.trim(), git_provider: gitProvider }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to save repo URL');
      }

      const data = await response.json();
      setGithubRepoUrl(data.github_repo_url);
      setEditingRepoUrl(false);
      setError(null);
      // Refresh queue to show auto-added commits
      fetchQueueItems();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save repo URL');
    } finally {
      setSavingRepoUrl(false);
    }
  };

  // Save an explicit repo URL (used when coming from Dashboard modal)
  const saveRepoUrl = useCallback(async (repoUrl: string) => {
    if (!projectId || !repoUrl.trim()) return;
    try {
      setSavingRepoUrl(true);
      const response = await fetch(`/api/projects/${projectId}/github-repo`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repo_url: repoUrl.trim(), git_provider: initialGitProvider }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to save repo URL');
      setGithubRepoUrl(data.github_repo_url);
      setRepoUrlInput(data.github_repo_url || repoUrl);
      setGitProvider(data.git_provider || initialGitProvider); // Update state with saved provider
      setEditingRepoUrl(false);
      setError(null);
      await new Promise((r) => setTimeout(r, 200));
      fetchQueueItems();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save repo URL');
    } finally {
      setSavingRepoUrl(false);
    }
  }, [fetchQueueItems, initialGitProvider, projectId]);

  const fetchProjectDetails = useCallback(async () => {
    try {
      const response = await fetch(`/api/projects/${projectId}`, {
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        const data = await response.json();
        setGithubRepoUrl(data.github_repo_url || null);
        
        // Store the git provider from backend (will be 'github' by default if not set)
        const savedProvider = data.git_provider || 'github';
        setGitProvider(savedProvider); // Update state with saved provider
        
        if (data.github_repo_url) {
          setRepoUrlInput(data.github_repo_url);
        } else if (initialRepoUrl && initialGitProvider) {
          // Persist the repo from modal so it survives navigation
          await saveRepoUrl(initialRepoUrl);
        }
      }
    } catch {
      setError('Failed to load project details');
    }
  }, [initialGitProvider, initialRepoUrl, projectId, saveRepoUrl]);

  useEffect(() => {
    fetchQueueItems();
  }, [fetchQueueItems]);

  // Separate effect for initial page load setup
  useEffect(() => {
    if (projectId) {
      fetchProjectDetails();
    }
  }, [fetchProjectDetails, projectId]);

  const syncCommits = async () => {
    if (!projectId) {
      setError('Project ID not available');
      return;
    }

    try {
      setSyncingCommits(true);
      setError(null); // Clear any previous errors
      
      const response = await fetch(`/api/projects/${projectId}/sync-commits`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to sync commits');
      }

      // Show result message
      if (data.added_count > 0) {
        setError(`✓ Successfully synced ${data.added_count} new commit(s)`);
        // Refresh queue to show synced commits
        await new Promise((resolve) => setTimeout(resolve, 500));
        fetchQueueItems();
      } else {
        setError(`ℹ No new commits found. All commits are already in the queue.`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to sync commits');
    } finally {
      setSyncingCommits(false);
    }
  };

  const handleStatusChange = (status: QueueStatus | 'all') => {
    setStatusFilter(status);
    setCurrentPage(1);
  };

  const handleContinueTest = (item: QueueItem) => {
    // For On Progress items: show dialog with tested and remaining files
    const testedFiles = normalizeTestedFiles(item.tested_files);
    const testableFiles = filterTestableFiles(item.file_list);
    const remainingFiles = testableFiles.filter(f => !testedFiles.includes(f));
    
    setContinueTestDialog({
      item,
      testedFiles,
      remainingFiles
    });
  };

  const handleContinueFileSelect = async (selectedFile: string) => {
    if (!continueTestDialog) return;
    
    const item = continueTestDialog.item;
    setContinueTestDialog(null);
    
    // Fetch only the selected file
    await fetchFileContentsAndNavigate(item, [selectedFile]);
  };

  const handleRunTest = async (item: QueueItem, testType: 'unit' | 'integration') => {
    if (testType === 'unit') {
      // Filter to only testable files
      const testableFiles = filterTestableFiles(item.file_list);
      
      // Check if multiple testable files - show selection dialog
      if (testableFiles.length > 1) {
        setFileSelectDialog({ item, files: testableFiles });
        return;
      }
      // Single testable file or no testable files - navigate directly
      await fetchFileContentsAndNavigate(item);
    } else {
      // For integration tests, execute directly
      setRunningTests(prev => new Set(prev).add(item.id));
      executeTest(item.id, testType);
    }
  };

  const handleFileSelect = async (selectedFile: string) => {
    if (!fileSelectDialog) return;
    
    const item = fileSelectDialog.item;
    setFileSelectDialog(null);
    
    // Fetch only the selected file
    await fetchFileContentsAndNavigate(item, [selectedFile]);
  };

  const fetchFileContentsAndNavigate = async (item: QueueItem, filesToFetch?: string[]) => {
    try {
      // Extract owner and repo from URL
      const urlParts = item.repo_url.split('/');
      const owner = urlParts[urlParts.length - 2];
      const repo = urlParts[urlParts.length - 1];

      // Use provided files or all files from the commit, filter to testable
      const targetFiles = filterTestableFiles(filesToFetch || item.file_list);

      // Fetch file contents for all changed files
      const fileContents: string[] = [];
      
      for (const filename of targetFiles) {
        try {
          if (gitProvider === 'gitlab') {
            // GitLab raw file content endpoint
            const projectPath = encodeURIComponent(`${owner}/${repo}`);
            const filePath = encodeURIComponent(filename);
            const url = `https://gitlab.com/api/v4/projects/${projectPath}/repository/files/${filePath}/raw?ref=${item.commit_hash}`;
            const response = await fetch(url);
            if (response.ok) {
              const content = await response.text();
              fileContents.push(`// File: ${filename}\n${content}`);
            }
          } else {
            // GitHub contents API
            const url = `https://api.github.com/repos/${owner}/${repo}/contents/${filename}?ref=${item.commit_hash}`;
            const response = await fetch(url, {
              headers: {
                'Accept': 'application/vnd.github.v3+json',
              },
            });
            if (response.ok) {
              const data = await response.json();
              // GitHub returns base64 encoded content
              const content = atob(data.content);
              fileContents.push(`// File: ${filename}\n${content}`);
            }
          }
        } catch {
          void 0;
        }
      }

      if (fileContents.length === 0) {
        setError('Unable to fetch file contents from Git');
        return;
      }

      // Combine all file contents
      const combinedCode = fileContents.join('\n\n');

      // Navigate to GenAiTest page with the code
      navigate('/test', {
        state: {
          initialCode: combinedCode,
          projectId: item.project_id,
          commitHash: item.commit_hash,
          queueItemId: item.id,
          testType: 'unit',
        },
      });
    } catch {
      setError('Failed to fetch file contents');
    }
  };

  const executeTest = async (itemId: number, testType: 'unit' | 'integration') => {
    try {
      const response = await fetch(
        `/api/test-items/${itemId}/run`,
        {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ testType }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Failed to run test');
        return;
      }

      // Refresh the list after a delay
      await new Promise((resolve) => setTimeout(resolve, 1000));
      fetchQueueItems();
    } catch {
      setError('Failed to execute test');
    } finally {
      setRunningTests(prev => {
        const newSet = new Set(prev);
        newSet.delete(itemId);
        return newSet;
      });
    }
  };

  const handleViewResult = async (item: QueueItem) => {
    // For Done items with multiple tested files, show file picker first
    const testedFiles = normalizeTestedFiles(item.tested_files);
    
    if (testedFiles.length > 1) {
      // Parse execution_logs_map to get file -> execution_log_id mapping
      let executionLogsMap: Record<string, number> = {};
      if (item.execution_logs_map) {
        try {
          const parsed = typeof item.execution_logs_map === 'string' 
            ? JSON.parse(item.execution_logs_map) 
            : item.execution_logs_map;
          executionLogsMap = parsed;
        } catch {
          void 0;
        }
      }
      
      setViewResultsDialog({
        item,
        testedFiles,
        executionLogsMap
      });
      return;
    }
    
    // Single file or no files - use existing logic
    await navigateToResults(item.execution_logs_link);
  };

  const handleViewFileResult = async (executionLogId: number) => {
    setViewResultsDialog(null);
    const url = `/api/results/${executionLogId}`;
    
    try {
      const response = await fetch(url, {
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to fetch test results');
      }

      const data = await response.json();
      
      const session = {
        id: String(executionLogId),
        execution_log_id: executionLogId,
        generatedTests: (data.test_results as ResultItem[]).map((result) => ({
          id: String(result.id),
          name: result.test_case_name,
          description: result.test_case_description || '',
          status: result.status,
          duration: result.execution_time_ms,
          code: result.code || `# Test: ${result.test_case_name}`,
          error: result.error_message,
        })),
        passedCount: data.execution_log.passed_count || 0,
        failedCount: data.execution_log.failed_count || 0,
        executionTime: data.execution_log.total_execution_time_ms || 0,
        language: data.execution_log.language || 'python',
        functionName: data.execution_log.function_name || 'function',
        framework: data.execution_log.framework,
        config: data.execution_log.config,
        originalTestCases: data.original_test_cases || [],
      };

      navigate('/results', { state: { session } });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load test results');
    }
  };

  const navigateToResults = async (executionLogId: string | null) => {
    try {
      if (!executionLogId) {
        setError('No test results found for this commit');
        return;
      }

      const id = parseInt(executionLogId);
      const url = `/api/results/${id}`;
      
      const response = await fetch(url, {
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to fetch test results');
      }

      const data = await response.json();

      const session = {
        id: String(id),
        execution_log_id: id,
        generatedTests: (data.test_results as ResultItem[]).map((result) => ({
          id: String(result.id),
          name: result.test_case_name,
          description: result.test_case_description || '',
          status: result.status,
          duration: result.execution_time_ms,
          code: result.code || `# Test: ${result.test_case_name}`,
          error: result.error_message,
        })),
        passedCount: data.execution_log.passed_count || 0,
        failedCount: data.execution_log.failed_count || 0,
        executionTime: data.execution_log.total_execution_time_ms || 0,
        language: data.execution_log.language || 'python',
        functionName: data.execution_log.function_name || 'function',
        framework: data.execution_log.framework,
        config: data.execution_log.config,
        originalTestCases: data.original_test_cases || [],
      };

      navigate('/results', { state: { session } });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load test results');
    }
  };

  const handleDeleteItem = async (itemId: number) => {
    if (!deleteDialog) return;

    try {
      const response = await fetch(
        `/api/test-items/${itemId}`,
        {
          method: 'DELETE',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to delete item');
      }

      // Refresh the list
      setDeleteDialog(null);
      fetchQueueItems();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete item');
      setDeleteDialog(null);
    }
  };

  const getFilterButtonStyles = (status: QueueStatus | 'all') => {
    const isActive = statusFilter === status;
    const isDark = theme === 'dark';
    
    if (isActive) {
      return isDark 
        ? 'bg-blue-600 text-white font-bold'
        : 'bg-blue-600 text-white font-bold';
    }
    
    return isDark
      ? 'bg-gray-700 text-gray-400 hover:bg-gray-600'
      : 'bg-gray-200 text-gray-700 hover:bg-gray-300';
  };

  return (
    <div 
      className={`min-h-screen transition-colors duration-300`}
      style={{ background: colors.bgPrimary }}
    >
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 
            className="text-4xl font-bold mb-2"
            style={{ color: colors.textPrimary }}
          >
            Test Queue
          </h1>
          <p style={{ color: colors.textMuted }}>
            Code submitted for testing via webhooks. Select a status and run tests.
          </p>
        </div>

        {/* Git Repository Configuration */}
        {projectId && (
          <div 
            className="mb-8 p-4 rounded-lg border transition-colors duration-300"
            style={{
              background: theme === 'dark' 
                ? 'linear-gradient(to right, rgba(139, 92, 246, 0.1), rgba(236, 72, 153, 0.1))'
                : 'linear-gradient(to right, rgba(139, 92, 246, 0.05), rgba(236, 72, 153, 0.05))',
              borderColor: theme === 'dark' 
                ? 'rgba(139, 92, 246, 0.3)'
                : 'rgba(139, 92, 246, 0.2)'
            }}
          >
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <Github 
                    className="w-5 h-5"
                    style={{ color: theme === 'dark' ? '#8B5CF6' : '#7C3AED' }}
                  />
                  <span 
                    className="font-semibold"
                    style={{ color: colors.textPrimary }}
                  >
                    Git Repository
                  </span>
                </div>
                {editingRepoUrl ? (
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={repoUrlInput}
                      onChange={(e) => setRepoUrlInput(e.target.value)}
                      placeholder="https://github.com/owner/repo"
                      className="flex-1 px-3 py-2 rounded transition-colors duration-300"
                      style={{
                        background: colors.bgInput,
                        borderColor: colors.borderPrimary,
                        color: colors.textPrimary,
                      }}
                    />
                    <button
                      onClick={saveGitHubRepoUrl}
                      disabled={savingRepoUrl}
                      className="px-4 py-2 rounded font-semibold transition-all duration-200 hover:opacity-90 disabled:opacity-60"
                      style={{
                        background: theme === 'dark' ? '#8B5CF6' : '#7C3AED',
                        color: 'white'
                      }}
                    >
                      {savingRepoUrl ? 'Saving...' : 'Save'}
                    </button>
                    <button
                      onClick={() => {
                        setEditingRepoUrl(false);
                        setRepoUrlInput(githubRepoUrl || '');
                      }}
                      className="px-4 py-2 rounded font-semibold transition-all duration-200 hover:opacity-90"
                      style={{
                        background: theme === 'dark' ? '#374151' : '#d1d5db',
                        color: theme === 'dark' ? 'white' : '#374151'
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    {githubRepoUrl ? (
                      <>
                        <span 
                          className="font-mono text-sm"
                          style={{ color: colors.textMuted }}
                        >
                          {githubRepoUrl}
                        </span>
                        <button
                          onClick={() => setEditingRepoUrl(true)}
                          className="px-3 py-1 text-sm rounded transition-colors duration-200 hover:opacity-90"
                          style={{
                            background: theme === 'dark' ? '#374151' : '#d1d5db',
                            color: theme === 'dark' ? 'white' : '#374151'
                          }}
                        >
                          Change
                        </button>
                        <button
                          onClick={syncCommits}
                          disabled={syncingCommits}
                          className="px-3 py-1 text-sm rounded font-semibold transition-all duration-200 hover:opacity-90 disabled:opacity-60"
                          style={{
                            background: '#22D3EE',
                            color: 'white'
                          }}
                        >
                          {syncingCommits ? 'Syncing...' : 'Sync Commits'}
                        </button>
                      </>
                    ) : (
                      <>
                        <span className="text-[#6B7280] italic">No repository configured</span>
                        <button
                          onClick={() => setEditingRepoUrl(true)}
                          className="px-3 py-1 text-sm bg-[#8B5CF6] text-white rounded hover:bg-[#7C3AED] transition-colors"
                        >
                          Add
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Error Banner */}
        {error && (
          <div 
            className="mb-6 p-4 rounded-lg border transition-colors duration-300"
            style={{
              background: theme === 'dark' 
                ? 'rgba(239, 68, 68, 0.1)'
                : 'rgba(239, 68, 68, 0.05)',
              borderColor: theme === 'dark'
                ? 'rgba(239, 68, 68, 0.3)'
                : 'rgba(239, 68, 68, 0.2)',
              color: theme === 'dark' ? '#ef4444' : '#dc2626'
            }}
          >
            {error}
          </div>
        )}

        {/* Filter Tabs */}
        <div className="flex flex-wrap gap-2.5 mb-8">
          <button
            onClick={() => handleStatusChange('pending')}
            className={`px-4 py-2 rounded transition-all duration-200 ${getFilterButtonStyles('pending')}`}
          >
            Pending
          </button>
          <button
            onClick={() => handleStatusChange('running')}
            className={`px-4 py-2 rounded transition-all duration-200 ${getFilterButtonStyles('running')}`}
          >
            On Progress
          </button>
          <button
            onClick={() => handleStatusChange('done')}
            className={`px-4 py-2 rounded transition-all duration-200 ${getFilterButtonStyles('done')}`}
          >
            Done
          </button>
        </div>

        {/* Main Content */}
        {loading ? (
          <div 
            className="text-center py-16 transition-colors duration-300"
            style={{ color: colors.textMuted }}
          >
            Loading queue items...
          </div>
        ) : items.length > 0 ? (
          <>
            {/* Table */}
            <div 
              className="rounded-xl overflow-hidden mb-6 border transition-colors duration-300"
              style={{
                borderColor: colors.borderPrimary,
                background: colors.bgCard
              }}
            >
              <div className="overflow-x-auto">
                <table 
                  className="w-full transition-colors duration-300"
                  style={{ background: colors.bgSecondary }}
                >
                  <thead 
                    className="border-b-2 transition-colors duration-300"
                    style={{
                      background: colors.bgTertiary,
                      borderColor: colors.borderPrimary
                    }}
                  >
                    <tr>
                      <th 
                        className="px-4 py-3 text-left text-sm font-bold"
                        style={{ color: colors.textPrimary }}
                      >
                        <div className="flex items-center gap-2">
                          <GitCommit className="w-4 h-4" />
                          Commit
                        </div>
                      </th>
                      <th 
                        className="px-4 py-3 text-left text-sm font-bold"
                        style={{ color: colors.textPrimary }}
                      >
                        <div className="flex items-center gap-2">
                          <GitBranch className="w-4 h-4" />
                          Branch
                        </div>
                      </th>
                      <th 
                        className="px-4 py-3 text-left text-sm font-bold"
                        style={{ color: colors.textPrimary }}
                      >
                        <div className="flex items-center gap-2">
                          <FileCode className="w-4 h-4" />
                          Files
                        </div>
                      </th>
                      <th 
                        className="px-4 py-3 text-left text-sm font-bold"
                        style={{ color: colors.textPrimary }}
                      >
                        <div className="flex items-center gap-2">
                          <User className="w-4 h-4" />
                          Author
                        </div>
                      </th>
                      <th 
                        className="px-4 py-3 text-left text-sm font-bold"
                        style={{ color: colors.textPrimary }}
                      >
                        Status
                      </th>
                      <th 
                        className="px-4 py-3 text-left text-sm font-bold"
                        style={{ color: colors.textPrimary }}
                      >
                        <div className="flex items-center gap-2">
                          <Calendar className="w-4 h-4" />
                          Created
                        </div>
                      </th>
                      <th 
                        className="px-4 py-3 text-center text-sm font-bold"
                        style={{ color: colors.textPrimary }}
                      >
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item) => {
                      const isRunning = runningTests.has(item.id);
                      const isClickable = item.status === 'running';
                      return (
                        <tr
                          key={item.id}
                          className={`border-b transition-colors duration-150 ${isClickable ? 'hover:bg-white/10 cursor-pointer' : 'hover:bg-white/5'}`}
                          style={{ 
                            borderColor: colors.borderPrimary,
                            background: colors.bgSecondary
                          }}
                          onClick={() => isClickable && handleContinueTest(item)}
                        >
                          <td 
                            className="px-4 py-3 text-xs font-mono"
                            style={{ color: colors.textMuted }}
                          >
                            {item.commit_hash.substring(0, 7)}
                          </td>
                          <td 
                            className="px-4 py-3 text-sm"
                            style={{ color: colors.textPrimary }}
                          >
                            {item.branch}
                          </td>
                          <td 
                            className="px-4 py-3 text-xs"
                            style={{ color: colors.textMuted }}
                          >
                            {statusFilter === 'pending' ? (
                              // For Pending: show plain file list
                              <div className="space-y-1">
                                {filterTestableFiles(item.file_list).map((file, idx) => (
                                  <div key={idx}>{file}</div>
                                ))}
                              </div>
                            ) : (
                              // For On Progress and Done: show progress count
                              <span className="text-sm font-mono">
                                {getProgressText(item.file_list, item.tested_files || [])}
                              </span>
                            )}
                          </td>
                          <td 
                            className="px-4 py-3 text-sm"
                            style={{ color: colors.textMuted }}
                          >
                            {item.author_name || '-'}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <StatusBadge 
                                status={item.status as QueueStatus}
                                className="px-3 py-1 rounded-xl font-bold"
                              >
                                {formatStatus(item.status)}
                              </StatusBadge>
                            </div>
                          </td>
                          <td 
                            className="px-4 py-3 text-xs"
                            style={{ color: colors.textMuted }}
                          >
                            {formatTimeAgo(item.created_at)}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-center gap-2">
                              {item.status === 'pending' && (
                                <>
                                  <button
                                    onClick={() => handleRunTest(item, 'unit')}
                                    disabled={isRunning}
                                    className="text-white text-sm font-bold px-3 py-1.5 rounded transition-all duration-200 hover:opacity-90 disabled:opacity-60 disabled:cursor-not-allowed"
                                    style={{
                                      background: theme === 'dark' ? '#28a745' : '#22c55e',
                                    }}
                                  >
                                    {isRunning ? 'Running...' : 'Unit'}
                                  </button>
                                  <button
                                    onClick={() => handleRunTest(item, 'integration')}
                                    disabled={isRunning}
                                    className="text-white text-sm font-bold px-3 py-1.5 rounded transition-all duration-200 hover:opacity-90 disabled:opacity-60 disabled:cursor-not-allowed"
                                    style={{
                                      background: theme === 'dark' ? '#007BFF' : '#3b82f6',
                                    }}
                                  >
                                    {isRunning ? 'Running...' : 'Integration'}
                                  </button>
                                  <DeleteButton
                                    onClick={() => setDeleteDialog({ id: item.id, hash: item.commit_hash.substring(0, 7) })}
                                    size="sm"
                                  />
                                </>
                              )}
                              {item.status === 'running' && (
                                <span 
                                  className="text-sm font-medium"
                                  style={{ color: theme === 'dark' ? '#FFA500' : '#EA8C55' }}
                                >
                                  In Progress...
                                </span>
                              )}
                              {item.status === 'done' && (
                                <>
                                  <button
                                    onClick={() => handleViewResult(item)}
                                    className="text-white text-sm font-medium px-3 py-1.5 rounded transition-all duration-200 hover:opacity-90"
                                    style={{
                                      background: theme === 'dark' ? '#6c757d' : '#9ca3af'
                                    }}
                                  >
                                    View
                                  </button>
                                  <DeleteButton
                                    onClick={() => setDeleteDialog({ id: item.id, hash: item.commit_hash.substring(0, 7) })}
                                    size="sm"
                                  />
                                </>
                              )}
                              {item.status === 'failed' && (
                                <>
                                  <span 
                                    className="text-xs max-w-xs truncate"
                                    style={{ color: theme === 'dark' ? '#DC143C' : '#dc2626' }}
                                    title={item.error_message || 'Failed'}
                                  >
                                    {item.error_message ? `${item.error_message.substring(0, 30)}...` : 'Failed'}
                                  </span>
                                  <DeleteButton
                                    onClick={() => setDeleteDialog({ id: item.id, hash: item.commit_hash.substring(0, 7) })}
                                    size="sm"
                                  />
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Pagination */}
            <CompactPagination
              currentPage={currentPage}
              totalItems={pagination?.count || 0}
              itemsPerPage={itemsPerPage}
              onPageChange={setCurrentPage}
              variant={theme === 'dark' ? 'dark' : 'light'}
            />
          </>
        ) : (
          <TableEmptyState
            emoji="📭"
            title="No items found for this status"
            variant={theme === 'dark' ? 'dark' : 'light'}
            isTableFooter={true}
          />
        )}

        {/* File Selection Dialog */}
        {fileSelectDialog && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div 
              className="border rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[80vh] overflow-y-auto transition-colors duration-300"
              style={{
                background: theme === 'dark' ? '#1a1f2e' : '#ffffff',
                borderColor: colors.borderPrimary
              }}
            >
              <h3 
                className="text-xl font-bold mb-4"
                style={{ color: colors.textPrimary }}
              >
                Select File to Test
              </h3>
              <p 
                className="mb-6"
                style={{ color: colors.textMuted }}
              >
                This commit contains multiple files. Please select which file you want to generate tests for:
              </p>
              <div className="space-y-2 mb-6">
                {fileSelectDialog.files.map((file, index) => (
                  <button
                    key={index}
                    onClick={() => handleFileSelect(file)}
                    className="w-full text-left px-4 py-3 rounded transition-all duration-300 group border"
                    style={{
                      background: colors.bgInput,
                      borderColor: colors.borderPrimary,
                      color: colors.textPrimary
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = colors.bgTertiary;
                      e.currentTarget.style.borderColor = theme === 'dark' ? '#8B5CF6' : '#7C3AED';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = colors.bgInput;
                      e.currentTarget.style.borderColor = colors.borderPrimary;
                    }}
                  >
                    <div className="flex items-center gap-3">
                      <FileCode 
                        className="w-5 h-5 flex-shrink-0"
                        style={{ color: theme === 'dark' ? '#8B5CF6' : '#7C3AED' }}
                      />
                      <span className="font-mono text-sm">
                        {file}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
              <div className="flex justify-end">
                <button
                  onClick={() => setFileSelectDialog(null)}
                  className="px-4 py-2 rounded font-semibold transition-all duration-300 hover:opacity-90"
                  style={{
                    background: theme === 'dark' ? '#374151' : '#d1d5db',
                    color: theme === 'dark' ? 'white' : '#374151'
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Continue Testing Dialog (for On Progress items) */}
        {continueTestDialog && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div 
              className="border rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[80vh] overflow-y-auto transition-colors duration-300"
              style={{
                background: theme === 'dark' ? '#1a1f2e' : '#ffffff',
                borderColor: colors.borderPrimary
              }}
            >
              <h3 
                className="text-xl font-bold mb-2"
                style={{ color: colors.textPrimary }}
              >
                Continue Testing
              </h3>
              <p 
                className="mb-6"
                style={{ color: colors.textMuted }}
              >
                Select which file you want to continue testing:
              </p>
              
              {/* Tested files (disabled, with checkmark) */}
              {continueTestDialog.testedFiles.length > 0 && (
                <div className="mb-6">
                  <p 
                    className="text-sm font-semibold mb-3"
                    style={{ color: '#32CD32' }}
                  >
                    ✓ Already Tested
                  </p>
                  <div className="space-y-2 mb-4">
                    {continueTestDialog.testedFiles.map((file, index) => (
                      <button
                        key={index}
                        disabled
                        className="w-full text-left px-4 py-3 rounded opacity-60 cursor-not-allowed border line-through"
                        style={{
                          background: colors.bgInput,
                          borderColor: colors.borderPrimary,
                          color: colors.textMuted
                        }}
                      >
                        <div className="flex items-center gap-3">
                          <span style={{ color: '#32CD32' }}>✓</span>
                          <span className="font-mono text-sm">
                            {file}
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Remaining files (clickable) */}
              {continueTestDialog.remainingFiles.length > 0 && (
                <div>
                  <p 
                    className="text-sm font-semibold mb-3"
                    style={{ color: colors.textPrimary }}
                  >
                    Continue with
                  </p>
                  <div className="space-y-2">
                    {continueTestDialog.remainingFiles.map((file, index) => (
                      <button
                        key={index}
                        onClick={() => handleContinueFileSelect(file)}
                        className="w-full text-left px-4 py-3 rounded transition-all duration-300 group border"
                        style={{
                          background: colors.bgInput,
                          borderColor: colors.borderPrimary,
                          color: colors.textPrimary
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = colors.bgTertiary;
                          e.currentTarget.style.borderColor = theme === 'dark' ? '#8B5CF6' : '#7C3AED';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = colors.bgInput;
                          e.currentTarget.style.borderColor = colors.borderPrimary;
                        }}
                      >
                        <div className="flex items-center gap-3">
                          <FileCode 
                            className="w-5 h-5 flex-shrink-0"
                            style={{ color: theme === 'dark' ? '#8B5CF6' : '#7C3AED' }}
                          />
                          <span className="font-mono text-sm">
                            {file}
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex justify-end mt-6">
                <button
                  onClick={() => setContinueTestDialog(null)}
                  className="px-4 py-2 rounded font-semibold transition-all duration-300 hover:opacity-90"
                  style={{
                    background: theme === 'dark' ? '#374151' : '#d1d5db',
                    color: theme === 'dark' ? 'white' : '#374151'
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* View Results Dialog (for Done items with multiple tested files) */}
        {viewResultsDialog && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div 
              className="border rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[80vh] overflow-y-auto transition-colors duration-300"
              style={{
                background: theme === 'dark' ? '#1a1f2e' : '#ffffff',
                borderColor: colors.borderPrimary
              }}
            >
              <h3 
                className="text-xl font-bold mb-2"
                style={{ color: colors.textPrimary }}
              >
                View Test Results
              </h3>
              <p 
                className="mb-6"
                style={{ color: colors.textMuted }}
              >
                Select which file's test results you want to view:
              </p>
              
              <div className="space-y-2 mb-6">
                {viewResultsDialog.testedFiles.map((file, index) => {
                  const executionLogId = viewResultsDialog.executionLogsMap[file];
                  return (
                    <button
                      key={index}
                      onClick={() => executionLogId && handleViewFileResult(executionLogId)}
                      disabled={!executionLogId}
                      className={`w-full text-left px-4 py-3 rounded transition-all duration-300 border`}
                      style={{
                        background: executionLogId ? colors.bgInput : colors.bgInput,
                        borderColor: executionLogId ? colors.borderPrimary : colors.borderPrimary,
                        color: executionLogId ? colors.textPrimary : colors.textMuted,
                        opacity: executionLogId ? 1 : 0.6,
                        cursor: executionLogId ? 'pointer' : 'not-allowed'
                      }}
                      onMouseEnter={(e) => {
                        if (executionLogId) {
                          e.currentTarget.style.background = colors.bgTertiary;
                          e.currentTarget.style.borderColor = theme === 'dark' ? '#8B5CF6' : '#7C3AED';
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (executionLogId) {
                          e.currentTarget.style.background = colors.bgInput;
                          e.currentTarget.style.borderColor = colors.borderPrimary;
                        }
                      }}
                    >
                      <div className="flex items-center gap-3">
                        <FileCode 
                          className="w-5 h-5 flex-shrink-0"
                          style={{ color: theme === 'dark' ? '#8B5CF6' : '#7C3AED' }}
                        />
                        <span className="font-mono text-sm">
                          {file}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>

              <div className="flex justify-end">
                <button
                  onClick={() => setViewResultsDialog(null)}
                  className="px-4 py-2 rounded font-semibold transition-all duration-300 hover:opacity-90"
                  style={{
                    background: theme === 'dark' ? '#374151' : '#d1d5db',
                    color: theme === 'dark' ? 'white' : '#374151'
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Delete Confirmation Dialog */}
        {deleteDialog && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div 
              className="border rounded-lg p-6 max-w-md w-full mx-4 transition-colors duration-300"
              style={{
                background: theme === 'dark' ? '#1a1f2e' : '#ffffff',
                borderColor: colors.borderPrimary
              }}
            >
              <h3 
                className="text-xl font-bold mb-4"
                style={{ color: colors.textPrimary }}
              >
                Delete Queue Item
              </h3>
              <p 
                className="mb-6"
                style={{ color: colors.textMuted }}
              >
                Are you sure you want to delete commit{' '}
                <span 
                  className="font-mono"
                  style={{ color: colors.textPrimary }}
                >
                  {deleteDialog.hash}
                </span>
                ? This action cannot be undone.
              </p>
              <div className="flex gap-3 justify-end">
                <button
                  onClick={() => setDeleteDialog(null)}
                  className="px-4 py-2 rounded font-semibold transition-all duration-300 hover:opacity-90"
                  style={{
                    background: theme === 'dark' ? '#374151' : '#d1d5db',
                    color: theme === 'dark' ? 'white' : '#374151'
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleDeleteItem(deleteDialog.id)}
                  className="px-4 py-2 text-white rounded font-semibold transition-all duration-300 hover:opacity-90"
                  style={{
                    background: theme === 'dark' ? '#DC143C' : '#dc2626'
                  }}
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Back Button */}
        <div className="mt-8">
          <button
            onClick={() => navigate('/dashboard', { state: { projectId } })}
            className="flex items-center gap-2 px-5 py-2.5 rounded font-bold transition-all duration-300 hover:opacity-90"
            style={{
              background: theme === 'dark' ? '#6c757d' : '#9ca3af',
              color: 'white'
            }}
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Project
          </button>
        </div>
      </div>
    </div>
  );
};

export default QueueDashboard;
