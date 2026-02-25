/**
 * Utility functions for file type detection and filtering
 */

// Testable source code file extensions
const TESTABLE_EXTENSIONS = ['.py', '.js', '.ts', '.jsx', '.tsx', '.java', '.cpp', '.c', '.csharp', '.rb', '.go', '.php'];

// Non-testable file types that should be excluded
export const NON_TESTABLE_EXTENSIONS = [
  '.md',
  '.txt',
  '.env',
  '.env.local',
  '.env.example',
  '.json',
  '.yaml',
  '.yml',
  '.xml',
  '.config',
  '.conf',
  '.properties',
  '.gradle',
  '.maven',
  '.sh',
  '.ps1',
  '.bat',
  '.cmd',
  '.dockerfile',
  '.sql',
  '.css',
  '.scss',
  '.sass',
  '.less',
  '.html',
  '.htm',
];

/**
 * Check if a file is testable (source code)
 */
export const isTestableFile = (filename: string): boolean => {
  const extension = getFileExtension(filename);
  return TESTABLE_EXTENSIONS.includes(extension);
};

/**
 * Get file extension including the dot
 */
export const getFileExtension = (filename: string): string => {
  const lastDot = filename.lastIndexOf('.');
  if (lastDot === -1) return '';
  return filename.substring(lastDot).toLowerCase();
};

/**
 * Filter testable files from a list
 */
export const filterTestableFiles = (files: string[]): string[] => {
  return files.filter(isTestableFile);
};

/**
 * Get count of testable files
 */
export const getTestableFileCount = (files: string[]): number => {
  return filterTestableFiles(files).length;
};

/**
 * Check if all testable files have been tested
 */
export const allTestableFilesTested = (
  totalFiles: string[],
  testedFiles: string[] | string | null
): boolean => {
  const testableFiles = filterTestableFiles(totalFiles);
  if (testableFiles.length === 0) return true; // No testable files = all tested
  const normalized = normalizeTestedFiles(testedFiles);
  return testableFiles.every(file => normalized.includes(file));
};

/**
 * Get progress indicator text
 */
export const getProgressText = (
  totalFiles: string[],
  testedFiles: string[] | string | null | undefined
): string => {
  const testableFiles = filterTestableFiles(totalFiles);
  const normalized = normalizeTestedFiles(testedFiles);
  const testedCount = normalized.filter(f => testableFiles.includes(f)).length;
  return `${testedCount}/${testableFiles.length}`;
};

/**
 * Check if a file has been tested
 */
export const isFileTested = (
  filename: string,
  testedFiles: string[] | string | null | undefined
): boolean => {
  const normalized = normalizeTestedFiles(testedFiles);
  return normalized.includes(filename);
};

/**
 * Normalize tested_files coming from backend (can be array, JSON string, or null)
 */
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
