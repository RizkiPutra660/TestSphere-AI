"""
Utility functions for file type detection and filtering (Python version)
"""

# Testable source code file extensions
TESTABLE_EXTENSIONS = ['.py', '.js', '.ts', '.jsx', '.tsx', '.java', '.cpp', '.c', '.csharp', '.rb', '.go', '.php']

# Non-testable file types that should be excluded
NON_TESTABLE_EXTENSIONS = [
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
]

def is_testable_file(filename: str) -> bool:
    """Check if a file is testable (source code)"""
    extension = get_file_extension(filename)
    return extension in TESTABLE_EXTENSIONS

def get_file_extension(filename: str) -> str:
    """Get file extension including the dot"""
    last_dot = filename.rfind('.')
    if last_dot == -1:
        return ''
    return filename[last_dot:].lower()

def filter_testable_files(files: list) -> list:
    """Filter testable files from a list"""
    return [f for f in files if is_testable_file(f)]

def get_testable_file_count(files: list) -> int:
    """Get count of testable files"""
    return len(filter_testable_files(files))

def all_testable_files_tested(total_files: list, tested_files: list) -> bool:
    """Check if all testable files have been tested"""
    testable_files = filter_testable_files(total_files)
    if not testable_files:
        return True  # No testable files = all tested
    return all(f in tested_files for f in testable_files)

def get_progress_text(total_files: list, tested_files: list) -> str:
    """Get progress indicator text"""
    testable_files = filter_testable_files(total_files)
    tested_count = sum(1 for f in tested_files if f in testable_files)
    return f"{tested_count}/{len(testable_files)}"

def is_file_tested(filename: str, tested_files: list) -> bool:
    """Check if a file has been tested"""
    return filename in tested_files
