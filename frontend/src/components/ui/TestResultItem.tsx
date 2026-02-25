import React, { useState } from 'react';
import { ChevronDown, ChevronRight, CheckCircle2, XCircle, AlertTriangle } from 'lucide-react';
import { StatusBadge } from './StatusBadge';
import { formatDuration, formatTestName } from '../../utils/formatters';
import { useTheme } from '../../context/ThemeContext';

// ============================================
// TestResultItem Component
// ============================================

export interface TestItemProps {
  id?: string;
  index?: number;
  name: string;
  description?: string;
  status: 'passed' | 'failed';
  duration?: number;
  code?: string;
  error?: string;        // full traceback
  errorSummary?: string; // human-readable assertion message
  onToggleExpand?: (id?: string) => void;
  isExpanded?: boolean;
  className?: string;
}

/**
 * TestResultItem: Displays a single test result with expandable code/error details
 * Perfect for test result lists, modal results, etc.
 */
export const TestResultItem = React.forwardRef<HTMLDivElement, TestItemProps>(
  (
    {
      id,
      index,
      name,
      description,
      status,
      duration,
      code,
      error,
      errorSummary,
      onToggleExpand,
      isExpanded = false,
      className = '',
    },
    ref
  ) => {
    const isPassed = status === 'passed';
    const { theme } = useTheme();
    const isDark = theme === 'dark';
    const [showTraceback, setShowTraceback] = useState(false);

    return (
      <div
        ref={ref}
        className={`transition-colors group ${isDark ? 'bg-[#0B0F19]/50 hover:bg-[#0B0F19]' : 'bg-white hover:bg-gray-50'} ${className}`}
      >
        {/* Header Row */}
        <div
          className={`p-5 cursor-pointer flex items-center gap-4 ${onToggleExpand ? 'cursor-pointer' : 'cursor-default'}`}
          onClick={() => onToggleExpand?.(id)}
        >
          {/* Status Icon */}
          <div className="flex-shrink-0">
            {isPassed ? (
              <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
              </div>
            ) : (
              <div className="w-8 h-8 rounded-lg bg-red-500/10 flex items-center justify-center">
                <XCircle className="w-5 h-5 text-red-400" />
              </div>
            )}
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 mb-1">
              <span className={`font-mono text-sm truncate transition-colors ${
                isDark 
                  ? 'text-white group-hover:text-indigo-300' 
                  : 'text-gray-900 group-hover:text-indigo-600'
              }`}>
                {index !== undefined && <span className={isDark ? "text-gray-500 mr-2" : "text-gray-400 mr-2"}>#{index + 1}</span>}
                {formatTestName(name)}
              </span>
              <StatusBadge status={status}>{status}</StatusBadge>
            </div>
            {description && (
              <p className={`text-sm truncate ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>{description}</p>
            )}
          </div>

          {/* Duration & Expand Icon */}
          <div className="flex items-center gap-4 flex-shrink-0">
            {duration && (
              <span className={`text-sm font-mono ${isDark ? 'text-gray-500' : 'text-gray-600'}`}>{duration}ms</span>
            )}
            {onToggleExpand && (
              isExpanded ? (
                <ChevronDown className={`w-5 h-5 ${isDark ? 'text-gray-400' : 'text-gray-600'}`} />
              ) : (
                <ChevronRight className={`w-5 h-5 transition-colors ${
                  isDark ? 'text-gray-400 group-hover:text-white' : 'text-gray-600 group-hover:text-gray-900'
                }`} />
              )
            )}
          </div>
        </div>

        {/* Expanded Content */}
        {isExpanded && onToggleExpand && (
          <div className={`px-5 pb-5 border-t animate-in fade-in slide-in-from-top-2 duration-200 ${
            isDark ? 'border-white/5' : 'border-gray-200'
          }`}>
            {/* Test Code Section */}
            {code && (
              <div className={`rounded-lg p-4 mt-4 border shadow-inner ${
                isDark 
                  ? 'bg-[#0d1117] border-white/5' 
                  : 'bg-gray-50 border-gray-300'
              }`}>
                <div className={`text-xs uppercase tracking-wider mb-2 font-semibold ${
                  isDark ? 'text-gray-500' : 'text-gray-600'
                }`}>
                  Test Code
                </div>
                <pre className={`text-sm font-mono overflow-x-auto ${
                  isDark ? 'text-gray-300' : 'text-gray-800'
                }`}>
                  <code>{code}</code>
                </pre>
              </div>
            )}

            {/* Error Section */}
            {!isPassed && (errorSummary || error) && (
              <div className={`border rounded-lg mt-4 overflow-hidden ${
                isDark ? 'bg-red-500/5 border-red-500/20' : 'bg-red-50 border-red-300'
              }`}>
                {/* Header */}
                <div className={`flex items-center gap-2 px-4 py-3 border-b ${
                  isDark ? 'border-red-500/20' : 'border-red-200'
                }`}>
                  <AlertTriangle className={`w-4 h-4 flex-shrink-0 ${
                    isDark ? 'text-red-400' : 'text-red-600'
                  }`} />
                  <span className={`text-xs font-semibold uppercase tracking-wider ${
                    isDark ? 'text-red-400' : 'text-red-700'
                  }`}>Why it failed</span>
                </div>

                {/* Summary — always visible */}
                <div className="px-4 py-3">
                  <pre className={`text-sm font-mono whitespace-pre-wrap break-words ${
                    isDark ? 'text-red-200' : 'text-red-900'
                  }`}>{errorSummary || error}</pre>
                </div>

                {/* Collapsible full traceback — only show if both exist */}
                {errorSummary && error && (
                  <div className={`border-t ${
                    isDark ? 'border-red-500/20' : 'border-red-200'
                  }`}>
                    <button
                      onClick={e => { e.stopPropagation(); setShowTraceback(v => !v); }}
                      className={`w-full flex items-center gap-2 px-4 py-2 text-xs font-medium transition-colors ${
                        isDark
                          ? 'text-gray-400 hover:text-gray-200 hover:bg-white/5'
                          : 'text-gray-500 hover:text-gray-700 hover:bg-red-100'
                      }`}
                    >
                      {showTraceback
                        ? <ChevronDown className="w-3.5 h-3.5" />
                        : <ChevronRight className="w-3.5 h-3.5" />}
                      {showTraceback ? 'Hide' : 'Show'} full traceback
                    </button>
                    {showTraceback && (
                      <div className={`px-4 pb-4`}>
                        <pre className={`text-xs font-mono whitespace-pre-wrap break-words rounded-lg p-3 max-h-64 overflow-y-auto ${
                          isDark ? 'bg-[#0d1117] text-gray-400' : 'bg-white text-gray-600 border border-red-200'
                        }`}>{error}</pre>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    );
  }
);
TestResultItem.displayName = 'TestResultItem';

// ============================================
// TestResultCompact Component (for modals/inline)
// ============================================

export interface CompactTestResultProps {
  title: string;
  status: 'passed' | 'failed';
  durationMs?: number;
  error?: string;
  className?: string;
}

/**
 * TestResultCompact: Minimal test result display for modal contexts
 * Perfect for inline test results in modals
 */
export const TestResultCompact = React.forwardRef<HTMLDivElement, CompactTestResultProps>(
  (
    {
      title,
      status,
      durationMs,
      error,
      className = '',
    },
    ref
  ) => {
    const [showError, setShowError] = useState(false);

    return (
      <div
        ref={ref}
        className={`px-4 py-3 ${className}`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-sm font-medium text-white break-words">{title}</div>
            {durationMs && (
              <div className="text-xs text-gray-500 mt-1">{formatDuration(durationMs)}</div>
            )}
          </div>

          <StatusBadge status={status}>{status}</StatusBadge>
        </div>

        {/* Error Details */}
        {error && (
          <details className="mt-2" open={showError} onToggle={() => setShowError(!showError)}>
            <summary className="text-xs text-red-300 cursor-pointer select-none hover:text-red-200">
              View error
            </summary>
            <div className="mt-2 text-xs text-red-300 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2 whitespace-pre-wrap break-words">
              {error}
            </div>
          </details>
        )}
      </div>
    );
  }
);
TestResultCompact.displayName = 'TestResultCompact';

// ============================================
// TestResultsSummary Component
// ============================================

export interface TestResultsSummaryProps {
  total: number;
  passed: number;
  failed: number;
  durationMs?: number;
  className?: string;
}

/**
 * TestResultsSummary: Quick stats bar for test results
 * Perfect for showing test summary stats
 */
export const TestResultsSummary = React.forwardRef<HTMLDivElement, TestResultsSummaryProps>(
  (
    {
      total,
      passed,
      failed,
      durationMs,
      className = '',
    },
    ref
  ) => {
    return (
      <div
        ref={ref}
        className={`flex flex-wrap gap-2 text-xs text-gray-200 ${className}`}
      >
        <span className="px-2 py-1 rounded-md bg-white/5 border border-gray-800">
          Total: {total}
        </span>
        <span className="px-2 py-1 rounded-md bg-emerald-500/10 border border-emerald-500/20 text-emerald-300">
          Passed: {passed}
        </span>
        <span className="px-2 py-1 rounded-md bg-red-500/10 border border-red-500/20 text-red-300">
          Failed: {failed}
        </span>
        {durationMs && (
          <span className="px-2 py-1 rounded-md bg-white/5 border border-gray-800">
            Duration: {formatDuration(durationMs)}
          </span>
        )}
        <span
          className={`px-2 py-1 rounded-md border ${
            failed === 0
              ? 'bg-green-500/10 text-green-300 border-green-500/20'
              : 'bg-red-500/10 text-red-300 border-red-500/20'
          }`}
        >
          {failed === 0 ? 'All Passed' : 'Failures'}
        </span>
      </div>
    );
  }
);
TestResultsSummary.displayName = 'TestResultsSummary';
