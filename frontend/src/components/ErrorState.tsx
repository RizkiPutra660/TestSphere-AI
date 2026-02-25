/**
 * Actionable Error State Components
 * 
 * Features:
 * - User-friendly error messages
 * - Actionable recovery suggestions
 * - Retry functionality
 * - Different error states (network, auth, validation, etc.)
 */

import React from 'react';
import { type ClassifiedError, ErrorType } from '../utils/apiClient';
import { Button } from './ui/Button';

// ========================================
// Error State Props
// ========================================

export interface ErrorStateProps {
  error: ClassifiedError | null;
  onRetry?: () => void;
  onDismiss?: () => void;
  className?: string;
  size?: 'small' | 'medium' | 'large';
}

// ========================================
// Error Icons
// ========================================

const ErrorIcon: React.FC<{ type: ErrorType }> = ({ type }) => {
  const getIcon = () => {
    switch (type) {
      case ErrorType.NETWORK:
        return (
          <svg className="w-12 h-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 5.636a9 9 0 010 12.728m0 0l-2.829-2.829m2.829 2.829L21 21M15.536 8.464a5 5 0 010 7.072m0 0l-2.829-2.829m-4.243 2.829a4.978 4.978 0 01-1.414-2.83m-1.414 5.658a9 9 0 01-2.167-9.238m7.824 2.167a1 1 0 111.414 1.414m-1.414-1.414L3 3m8.293 8.293l1.414 1.414" />
          </svg>
        );
      case ErrorType.AUTH:
        return (
          <svg className="w-12 h-12 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
        );
      case ErrorType.NOT_FOUND:
        return (
          <svg className="w-12 h-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        );
      case ErrorType.VALIDATION:
        return (
          <svg className="w-12 h-12 text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        );
      case ErrorType.RATE_LIMIT:
        return (
          <svg className="w-12 h-12 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        );
      case ErrorType.SERVER:
      default:
        return (
          <svg className="w-12 h-12 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        );
    }
  };

  return <div className="flex justify-center mb-4">{getIcon()}</div>;
};

// ========================================
// Main Error State Component
// ========================================

export const ErrorState: React.FC<ErrorStateProps> = ({
  error,
  onRetry,
  onDismiss,
  className = '',
  size = 'medium',
}) => {
  if (!error) return null;

  const sizeClasses = {
    small: 'p-4 text-sm',
    medium: 'p-6 text-base',
    large: 'p-8 text-lg',
  };

  const getActions = () => {
    const actions = [];

    // Retry button for retryable errors
    if (error.retryable && onRetry) {
      actions.push(
        <Button
          key="retry"
          onClick={onRetry}
          variant="primary"
          className="mr-2"
        >
          Try Again
        </Button>
      );
    }

    // Specific actions based on error type
    switch (error.type) {
      case ErrorType.AUTH:
        actions.push(
          <Button
            key="login"
            onClick={() => (window.location.href = '/login')}
            variant="primary"
          >
            Log In
          </Button>
        );
        break;

      case ErrorType.NOT_FOUND:
        actions.push(
          <Button
            key="back"
            onClick={() => window.history.back()}
            variant="secondary"
          >
            Go Back
          </Button>
        );
        break;

      case ErrorType.NETWORK:
        actions.push(
          <Button
            key="refresh"
            onClick={() => window.location.reload()}
            variant="secondary"
          >
            Refresh Page
          </Button>
        );
        break;

      case ErrorType.RATE_LIMIT:
        actions.push(
          <Button
            key="wait"
            onClick={onDismiss}
            variant="secondary"
          >
            I'll Wait
          </Button>
        );
        break;
    }

    // Dismiss button
    if (onDismiss && !error.retryable) {
      actions.push(
        <Button
          key="dismiss"
          onClick={onDismiss}
          variant="ghost"
        >
          Dismiss
        </Button>
      );
    }

    return actions;
  };

  const getTips = () => {
    switch (error.type) {
      case ErrorType.NETWORK:
        return (
          <ul className="text-sm text-gray-600 dark:text-gray-400 mt-4 space-y-1">
            <li>• Check your internet connection</li>
            <li>• Check if the server is accessible</li>
            <li>• Try disabling VPN or proxy</li>
          </ul>
        );

      case ErrorType.VALIDATION:
        if (error.error && typeof error.error === 'object' && 'response' in error.error) {
          const axiosError = error.error as { response?: { data?: { error?: { field_errors?: Record<string, string[] | string> } } } };
          const fieldErrors = axiosError.response?.data?.error?.field_errors;
          if (fieldErrors) {
            return (
              <ul className="text-sm text-red-600 dark:text-red-400 mt-4 space-y-1">
                {Object.entries(fieldErrors).map(([field, errors]) => (
                  <li key={field}>
                    • <strong>{field}:</strong> {Array.isArray(errors) ? errors.join(', ') : errors}
                  </li>
                ))}
              </ul>
            );
          }
        }
        return null;

      case ErrorType.RATE_LIMIT:
        return (
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-4">
            Please wait a moment before trying again. We'll let you know when you can retry.
          </p>
        );

      case ErrorType.SERVER:
        return (
          <ul className="text-sm text-gray-600 dark:text-gray-400 mt-4 space-y-1">
            <li>• Our team has been notified</li>
            <li>• Try again in a few moments</li>
            <li>• Contact support if the issue persists</li>
          </ul>
        );

      default:
        return null;
    }
  };

  return (
    <div
      className={`bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 ${sizeClasses[size]} ${className}`}
    >
      <ErrorIcon type={error.type} />
      
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white text-center mb-2">
        {getTitle(error.type)}
      </h3>
      
      <p className="text-gray-700 dark:text-gray-300 text-center mb-4">
        {error.userMessage}
      </p>

      {getTips()}

      <div className="flex justify-center items-center mt-6 space-x-2">
        {getActions()}
      </div>

      {/* Debug info (only in development) */}
      {import.meta.env.DEV && (
        <details className="mt-6 text-xs text-gray-500">
          <summary className="cursor-pointer hover:text-gray-700">
            Technical Details (Dev Only)
          </summary>
          <pre className="mt-2 p-2 bg-gray-100 dark:bg-gray-900 rounded overflow-auto">
            {JSON.stringify(
              {
                type: error.type,
                message: error.message,
                statusCode: error.statusCode,
                retryable: error.retryable,
              },
              null,
              2
            )}
          </pre>
        </details>
      )}
    </div>
  );
};

const getTitle = (type: ErrorType): string => {
  switch (type) {
    case ErrorType.NETWORK:
      return 'Connection Problem';
    case ErrorType.AUTH:
      return 'Authentication Required';
    case ErrorType.VALIDATION:
      return 'Invalid Input';
    case ErrorType.NOT_FOUND:
      return 'Not Found';
    case ErrorType.RATE_LIMIT:
      return 'Too Many Requests';
    case ErrorType.SERVER:
      return 'Server Error';
    case ErrorType.TIMEOUT:
      return 'Request Timeout';
    default:
      return 'Something Went Wrong';
  }
};

// ========================================
// Inline Error Alert (for forms)
// ========================================

export interface InlineErrorProps {
  error: ClassifiedError | null;
  onRetry?: () => void;
  className?: string;
}

export const InlineError: React.FC<InlineErrorProps> = ({ error, onRetry, className = '' }) => {
  if (!error) return null;

  return (
    <div
      className={`bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 ${className}`}
      role="alert"
    >
      <div className="flex items-start">
        <svg
          className="w-5 h-5 text-red-400 mr-3 flex-shrink-0"
          fill="currentColor"
          viewBox="0 0 20 20"
        >
          <path
            fillRule="evenodd"
            d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
            clipRule="evenodd"
          />
        </svg>
        <div className="flex-1">
          <p className="text-sm font-medium text-red-800 dark:text-red-200">
            {error.userMessage}
          </p>
          {error.retryable && onRetry && (
            <button
              onClick={onRetry}
              className="text-sm text-red-600 dark:text-red-400 hover:text-red-500 dark:hover:text-red-300 underline mt-1"
            >
              Try again
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

// ========================================
// Toast Notification for Errors
// ========================================

export interface ErrorToastProps {
  error: ClassifiedError;
  onClose: () => void;
  autoClose?: number; // milliseconds
}

export const ErrorToast: React.FC<ErrorToastProps> = ({
  error,
  onClose,
  autoClose = 5000,
}) => {
  React.useEffect(() => {
    if (autoClose > 0) {
      const timer = setTimeout(onClose, autoClose);
      return () => clearTimeout(timer);
    }
  }, [autoClose, onClose]);

  const getColor = () => {
    switch (error.type) {
      case ErrorType.VALIDATION:
        return 'bg-orange-500';
      case ErrorType.AUTH:
        return 'bg-yellow-500';
      case ErrorType.RATE_LIMIT:
        return 'bg-blue-500';
      default:
        return 'bg-red-500';
    }
  };

  return (
    <div
      className={`${getColor()} text-white px-6 py-4 rounded-lg shadow-lg flex items-center justify-between min-w-[320px] max-w-md`}
      role="alert"
    >
      <div className="flex items-center">
        <svg className="w-6 h-6 mr-3" fill="currentColor" viewBox="0 0 20 20">
          <path
            fillRule="evenodd"
            d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
            clipRule="evenodd"
          />
        </svg>
        <span>{error.userMessage}</span>
      </div>
      <button
        onClick={onClose}
        className="ml-4 text-white hover:text-gray-200 transition-colors"
        aria-label="Close"
      >
        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
          <path
            fillRule="evenodd"
            d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
            clipRule="evenodd"
          />
        </svg>
      </button>
    </div>
  );
};

// ========================================
// Loading State with Error Fallback
// ========================================

export interface LoadingStateProps {
  loading: boolean;
  error: ClassifiedError | null;
  onRetry?: () => void;
  children: React.ReactNode;
  loadingText?: string;
}

export const LoadingState: React.FC<LoadingStateProps> = ({
  loading,
  error,
  onRetry,
  children,
  loadingText = 'Loading...',
}) => {
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mb-4"></div>
        <p className="text-gray-600 dark:text-gray-400">{loadingText}</p>
      </div>
    );
  }

  if (error) {
    return <ErrorState error={error} onRetry={onRetry} />;
  }

  return <>{children}</>;
};
