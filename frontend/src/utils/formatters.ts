/**
 * Formatters Utility
 * 
 * Centralized formatting functions eliminating duplicate formatter code
 * across components (UiTestingModal, TestResultItem, QueueDashboard, etc.)
 * 
 * Provides standardized formatting for:
 * - Duration/time formatting (ms to human-readable)
 * - Status text formatting (capitalize, uppercase)
 * - Relative time formatting ("2 hours ago")
 * - String utilities (capitalize first letter)
 */

/**
 * Format milliseconds to human-readable duration
 * Used in: UiTestingModal, TestResultItem (2 instances), ApiTestingModal
 * 
 * @param ms - Duration in milliseconds
 * @returns Formatted string (e.g., "150ms" or "2.35s")
 * 
 * @example
 * formatDuration(150) // "150ms"
 * formatDuration(2350) // "2.35s"
 * formatDuration(null) // "-"
 */
/**
 * Format a programmatic test function name into a human-readable label.
 * Handles camelCase, PascalCase, and snake_case.
 *
 * @example
 * formatTestName('testAdd')            // 'Test Add'
 * formatTestName('testIsPalindrome')   // 'Test Is Palindrome'
 * formatTestName('test_flatten_list')  // 'Test Flatten List'
 * formatTestName('TestRemoveDuplicates') // 'Test Remove Duplicates'
 */
export const formatTestName = (name: string): string => {
  if (!name) return name;

  // Strip leading 'test_' or 'test' prefix (case-insensitive)
  let cleaned = name.replace(/^test[_]?/i, '');

  // Convert snake_case to spaces
  cleaned = cleaned.replace(/_/g, ' ');

  // Insert space before uppercase letters in camelCase/PascalCase
  cleaned = cleaned.replace(/([a-z])([A-Z])/g, '$1 $2');

  // Collapse multiple spaces and trim
  cleaned = cleaned.replace(/\s+/g, ' ').trim();

  // Capitalise first letter
  if (!cleaned) return name;
  return 'Test ' + cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
};

export const formatDuration = (ms: number | null | undefined): string => {
  if (ms === null || ms === undefined) return "-";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
};

/**
 * Format date to relative time ("2 hours ago" or actual date if old)
 * Used in: QueueDashboard
 * 
 * @param dateString - ISO date string or null
 * @returns Formatted relative time string
 * 
 * @example
 * formatTimeAgo("2026-01-15T10:30:00Z") // "2 hours ago"
 * formatTimeAgo("2025-12-01T10:30:00Z") // "Dec 1"
 * formatTimeAgo(null) // "-"
 */
export const formatTimeAgo = (dateString: string | null | undefined): string => {
  if (!dateString) return '-';
  
  try {
    // Parse the date string - handle both ISO and custom formats
    let date = new Date(dateString);
    const now = new Date();
    
    // Validate the date
    if (isNaN(date.getTime())) {
      return '-';
    }
    
    // Calculate difference in seconds
    let seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    // If time is in the future, it might be a timezone issue
    // Try to adjust if the date looks wrong (more than 12 hours in future)
    if (seconds < -43200) { // more than 12 hours in future
      // Try parsing as UTC explicitly
      const match = dateString.match(/(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})/);
      if (match) {
        date = new Date(Date.UTC(
          parseInt(match[1]),
          parseInt(match[2]) - 1,
          parseInt(match[3]),
          parseInt(match[4]),
          parseInt(match[5]),
          parseInt(match[6])
        ));
        seconds = Math.floor((now.getTime() - date.getTime()) / 1000);
      }
    }

    // Less than 1 minute
    if (seconds >= 0 && seconds < 60) {
      return `${seconds} second${seconds !== 1 ? 's' : ''} ago`;
    }
    
    // Less than 1 hour
    if (seconds >= 60) {
      const minutes = Math.floor(seconds / 60);
      if (minutes < 60) {
        return `${minutes} minute${minutes !== 1 ? 's' : ''} ago`;
      }
      
      // Less than 1 day
      const hours = Math.floor(minutes / 60);
      if (hours < 24) {
        return `${hours} hour${hours !== 1 ? 's' : ''} ago`;
      }
      
      // Less than 1 week
      const days = Math.floor(hours / 24);
      if (days < 7) {
        return `${days} day${days !== 1 ? 's' : ''} ago`;
      }
      
      // More than 1 week - show the actual date
      return date.toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric', 
        year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
      });
    }

    // If we get here and seconds is still negative or very small, show formatted date
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric', 
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch {
    return '-';
  }
};

/**
 * Capitalize first letter of a string
 * Used in: TestHistory, CodeInput, various status displays
 * 
 * @param str - String to capitalize
 * @returns String with first letter capitalized
 * 
 * @example
 * capitalize("python") // "Python"
 * capitalize("JAVA") // "JAVA" (only first letter affected)
 * capitalize("") // ""
 */
export const capitalize = (str: string | null | undefined): string => {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
};

/**
 * Format status text for display
 * Handles special cases like "running" -> "ON PROGRESS"
 * Used in: QueueDashboard status badge display
 * 
 * @param status - Status string
 * @param options - Formatting options
 * @returns Formatted status text
 * 
 * @example
 * formatStatus("pending") // "PENDING"
 * formatStatus("running") // "ON PROGRESS"
 * formatStatus("done") // "DONE"
 * formatStatus("failed") // "FAILED"
 */
export const formatStatus = (
  status: string,
  options?: {
    runningText?: string;
    uppercase?: boolean;
  }
): string => {
  const { runningText = 'ON PROGRESS', uppercase = true } = options || {};
  
  if (status === 'running') {
    return runningText;
  }
  
  return uppercase ? status.toUpperCase() : status;
};

/**
 * Normalize status from backend to frontend format
 * Used in: Loading page status normalization
 * 
 * @param backendStatus - Status string from backend (uppercase)
 * @returns Normalized lowercase status
 * 
 * @example
 * normalizeStatus("PASSED") // "passed"
 * normalizeStatus("FAILED") // "failed"
 * normalizeStatus("ERROR") // "failed"
 */
export const normalizeStatus = (backendStatus: string): 'passed' | 'failed' => {
  const upper = backendStatus.toUpperCase();
  return upper === 'PASSED' ? 'passed' : 'failed';
};

/**
 * Get error message for status
 * Used in: Loading page error message generation
 * 
 * @param status - Status string from backend
 * @returns Error message or null
 * 
 * @example
 * getStatusError("ERROR") // "Test had an error during execution"
 * getStatusError("FAILED") // "See output for details"
 * getStatusError("PASSED") // null
 */
export const getStatusError = (status: string): string | null => {
  const upper = status.toUpperCase();
  if (upper === 'ERROR') return 'Test had an error during execution';
  if (upper === 'FAILED') return 'See output for details';
  return null;
};

// ============================================
// URL/Path Normalization Utilities
// ============================================

/**
 * Normalize base URL by removing trailing slashes
 * Used in: ApiTestingModal, UiTestingModal, playwright runner
 * 
 * @param url - URL to normalize
 * @returns URL without trailing slashes
 * 
 * @example
 * normalizeBaseUrl("http://localhost:5000/") // "http://localhost:5000"
 * normalizeBaseUrl("http://localhost:5000///") // "http://localhost:5000"
 * normalizeBaseUrl("  http://localhost:5000  ") // "http://localhost:5000"
 */
export const normalizeBaseUrl = (url: string): string => {
  return url.trim().replace(/\/+$/, "");
};

/**
 * Normalize path by ensuring it starts with a forward slash
 * Used in: ApiTestingModal, UiTestingModal, playwright runner
 * 
 * @param path - Path to normalize
 * @returns Path with leading slash
 * 
 * @example
 * normalizePath("api/users") // "/api/users"
 * normalizePath("/api/users") // "/api/users"
 * normalizePath("  /api/users  ") // "/api/users"
 * normalizePath("") // ""
 */
export const normalizePath = (path: string): string => {
  const trimmed = path.trim();
  if (!trimmed) return "";
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
};
