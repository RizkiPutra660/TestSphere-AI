import os
import re
import sys
import uuid
import json
import shutil
import tempfile
import subprocess
import logging
from enum import Enum
from typing import Dict, Optional, Set
import ast

logger = logging.getLogger(__name__)

# Deployment Config
SHARED_WORK_DIR = os.environ.get('SHARED_WORK_DIR')
DOCKER_VOLUME_NAME = os.environ.get('DOCKER_VOLUME_NAME')

def _get_docker_mount_args(job_dir: str) -> list:
    """
    Returns the Docker arguments for mounting the workspace.
    If using Named Volumes (Production/DooD), mounts the volume.
    If using Host Paths (Local Dev), bind mounts the directory.
    """
    if SHARED_WORK_DIR and DOCKER_VOLUME_NAME:
        # Production: Mount named volume
        # Sanity check
        if not job_dir.startswith(SHARED_WORK_DIR.rstrip("/") + "/"):
             # Fallback or error? For safety, let's treat it as a critical config error if logic is drifting
             # But practically, job_dir is path.join(SHARED_WORK_DIR, ...), so strictly it should match.
             # If mixed up (e.g. local temp dir passed here), we should fallback or raise.
             # Given the caller logic, let's assume if we are here, we INTENDED to use volumes.
             pass 

        rel_path = os.path.relpath(job_dir, SHARED_WORK_DIR)
        
        # We mount the ENTIRE volume to /workspace
        # And set CWD to the specific job subdirectory
        return [
            "-v", f"{DOCKER_VOLUME_NAME}:/workspace",
            "-w", f"/workspace/{rel_path}"
        ]
    else:
        # Local Dev: Bind mount host path
        return [
            "-v", f"{job_dir}:/app:rw",
            "-w", "/app"
        ]



class ExecutionMode(Enum):
    UNIT = "unit"
    INTEGRATION = "integration"


# -----------------------------
# Shared helpers
# -----------------------------

def _select_executor_image(source_code: str, test_code: str, language: str, config: Dict) -> str:
    """
    Select pre-built executor image based on BOTH source + test code.
    """
    # explicit override always wins
    executor_type = (config or {}).get("executor_type")
    if executor_type:
        mapping = {
            "python-basic": "genaiqa/python-basic:latest",
            "python-web": "genaiqa/python-web:latest",
            "java-basic": "genaiqa/java-basic:latest",
            "javascript-basic": "genaiqa/javascript-basic:latest",
        }
        return mapping.get(executor_type, "genaiqa/python-basic:latest")

    combined = (source_code + "\n" + test_code).lower()

    if language == "java":
        return "genaiqa/java-basic:latest"
    if language in ("javascript", "typescript"):
        return "genaiqa/javascript-basic:latest"

    # python web deps
    if any(k in combined for k in ["from flask", "import flask", "flask.", "requests", "httpx", "fastapi"]):
        return "genaiqa/python-web:latest"

    return "genaiqa/python-basic:latest"


def _detect_language(source_code: str, test_code: str, language: Optional[str]) -> str:
    lang = (language or "").lower().strip()

    # Unambiguous languages — trust caller
    if lang in ("python", "java"):
        return lang

    combined = source_code + "\n" + test_code

    # TypeScript-specific syntax patterns
    _TS_PATTERNS = [
        ": string", ": number", ": boolean", ": void", ": never", ": any",
        ": null", ": undefined", ": object",
        "interface ", "type ", "enum ",
        ": string[]", ": number[]", ": boolean[]",
        "as string", "as number", "as boolean",
        "<T>", "<T,", "<T extends",
        "@ts-", "// @ts",
        "private ", "public ", "protected ", "readonly ",
        ": Promise<", ": Array<",
        "export interface", "export type", "export enum",
        "@ts-expect-error", "@ts-ignore",
    ]
    has_ts_syntax = any(p in combined for p in _TS_PATTERNS)

    # If caller says typescript, or we detect TS syntax in JS/unknown code → typescript
    if lang == "typescript" or lang == "ts" or has_ts_syntax:
        return "typescript"

    if lang in ("javascript", "js"):
        return "javascript"

    if lang:
        return lang

    # ── no explicit language: heuristic detection ──────────────────────────

    # Java: require class + java/org imports
    has_public_class = bool(re.search(r"\bpublic\s+class\b", combined))
    has_java_imports = ("import java." in combined) or ("import org." in combined)
    if has_public_class and has_java_imports:
        return "java"

    # JS/TS heuristics
    if any(x in combined for x in ["describe(", "it(", "test(", "expect(", "jest.", "require("]):
        if has_ts_syntax:
            return "typescript"
        return "javascript"

    return "python"


# -----------------------------
# Python preprocessing (robust)
# -----------------------------

# Map import names → pip package names (when they differ)
_IMPORT_TO_PIP: Dict[str, str] = {
    "PIL": "Pillow",
    "cv2": "opencv-python",
    "sklearn": "scikit-learn",
    "bs4": "beautifulsoup4",
    "serial": "pyserial",
    "yaml": "PyYAML",
    "dateutil": "python-dateutil",
    "dotenv": "python-dotenv",
    "Crypto": "pycryptodome",
    "nacl": "PyNaCl",
    "google": "google-cloud",
    "boto3": "boto3",
    "botocore": "botocore",
    "pymysql": "PyMySQL",
    "psycopg2": "psycopg2-binary",
    "motor": "motor",
    "aiohttp": "aiohttp",
    "httpx": "httpx",
    "pydantic": "pydantic",
    "fastapi": "fastapi",
    "starlette": "starlette",
    "celery": "celery",
    "redis": "redis",
    "elasticsearch": "elasticsearch",
    "mongoengine": "mongoengine",
    "passlib": "passlib",
    "jwt": "PyJWT",
    "freezegun": "freezegun",
    "faker": "Faker",
    "factory_boy": "factory_boy",
    "hypothesis": "hypothesis",
    "responses": "responses",
    "moto": "moto",
    "pytest_mock": "pytest-mock",
    "respx": "respx",
    "time_machine": "time-machine",
}

# Python stdlib modules (extends sys.stdlib_module_names for older pythons)
_STDLIB_MODULES: Set[str] = set(getattr(sys, "stdlib_module_names", set())) | {
    "os", "sys", "re", "json", "datetime", "time", "collections", "functools",
    "itertools", "typing", "unittest", "pytest", "logging", "pathlib", "subprocess",
    "tempfile", "shutil", "uuid", "random", "math", "decimal", "statistics",
    "hashlib", "hmac", "secrets", "urllib", "io", "abc", "copy", "dataclasses",
    "enum", "contextlib", "threading", "multiprocessing", "socket", "ssl",
    "struct", "base64", "binascii", "codecs", "csv", "xml", "html", "http",
    "email", "mimetypes", "builtins", "warnings", "weakref", "gc", "inspect",
    "ast", "dis", "tokenize", "importlib", "pkgutil", "site", "traceback",
    "pprint", "textwrap", "string", "difflib", "fnmatch", "glob", "zipfile",
    "tarfile", "gzip", "bz2", "lzma", "zlib", "sqlite3", "configparser",
    "argparse", "getopt", "shlex", "operator", "numbers", "array", "queue",
    "heapq", "bisect", "calendar", "locale", "gettext", "platform", "signal",
    # test helpers already in stdlib or pre-installed
    "mock", "_pytest", "conftest",
    # pre-installed in the executor image
    "pytest", "flask", "requests", "werkzeug",
}


def _auto_detect_pip_requirements(test_code: str, exclude: Optional[Set[str]] = None) -> str:
    """
    Parse all import statements from test_code, identify non-stdlib packages,
    and return a requirements.txt string with those packages.
    Pass `exclude` to skip known local module names (e.g. filenames in multi-file mode).
    """
    try:
        tree = ast.parse(test_code)
    except SyntaxError:
        return ""

    top_level_imports: Set[str] = set()

    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                top_level_imports.add(alias.name.split(".")[0])
        elif isinstance(node, ast.ImportFrom):
            if node.module and node.level == 0:
                top_level_imports.add(node.module.split(".")[0])

    packages = []
    for mod in sorted(top_level_imports):
        if mod in _STDLIB_MODULES:
            continue
        if exclude and mod in exclude:
            continue
        pip_name = _IMPORT_TO_PIP.get(mod, mod)
        packages.append(pip_name)

    return "\n".join(packages) if packages else ""


def _merge_requirements(user_req: Optional[str], auto_req: str) -> Optional[str]:
    """Merge user-supplied requirements with auto-detected ones, deduplicating."""
    combined = set()
    for line in (user_req or "").splitlines():
        line = line.strip()
        if line and not line.startswith("#"):
            combined.add(line.lower())
    auto_lines = []
    for line in auto_req.splitlines():
        line = line.strip()
        if line and line.lower() not in combined:
            auto_lines.append(line)
            combined.add(line.lower())
    all_lines = [l for l in (user_req or "").splitlines() if l.strip()] + auto_lines
    return "\n".join(all_lines) if all_lines else None


_ALLOWED_REWRITE_MODULES = {"app", "main", "your_module", "module", "solution", "program"}

def _auto_import_from_source_if_missing(processed_test: str, fixed_source: str) -> str:
    # Parse source to get top-level defs/classes
    try:
        src_tree = ast.parse(fixed_source)
    except SyntaxError:
        return processed_test  # don't risk making it worse

    defined = set()
    for node in src_tree.body:
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
            defined.add(node.name)

    # Parse test to find used names + already imported names
    try:
        test_tree = ast.parse(processed_test)
    except SyntaxError:
        return processed_test

    imported = set()
    uses_source_module = False

    class ImportVisitor(ast.NodeVisitor):
        def visit_Import(self, node):
            nonlocal uses_source_module
            for alias in node.names:
                if alias.name == "source":
                    uses_source_module = True
                imported.add(alias.asname or alias.name.split(".")[0])

        def visit_ImportFrom(self, node):
            if node.module == "source":
                for alias in node.names:
                    if alias.name == "*":
                        # if star import exists, don't inject anything
                        imported.add("*")
                    else:
                        imported.add(alias.asname or alias.name)

    class NameUseVisitor(ast.NodeVisitor):
        def __init__(self):
            self.used = set()

        def visit_Name(self, node):
            # Only count read-context names, not assignments
            if isinstance(node.ctx, ast.Load):
                self.used.add(node.id)

        def visit_Attribute(self, node):
            # detect "source.foo"
            nonlocal uses_source_module
            if isinstance(node.value, ast.Name) and node.value.id == "source":
                uses_source_module = True
                self.used.add(node.attr)
            self.generic_visit(node)

        def visit_Call(self, node):
            # If call is `foo(...)`, `foo` already covered by Name visitor (Load)
            self.generic_visit(node)

    ImportVisitor().visit(test_tree)
    if "*" in imported:
        return processed_test

    name_visitor = NameUseVisitor()
    name_visitor.visit(test_tree)

    # If test uses `source.<name>` style, don't inject `from source import ...`
    # because it is already referencing source module correctly.
    if uses_source_module:
        return processed_test

    missing = sorted((defined & name_visitor.used) - imported)
    if not missing:
        return processed_test

    import_stmt = f"from source import {', '.join(missing)}"
    return _insert_import_after_import_block(processed_test, import_stmt)


def _insert_import_after_import_block(code: str, import_stmt: str) -> str:
    lines = code.splitlines()
    i = 0

    # Skip shebang / encoding
    if i < len(lines) and lines[i].startswith("#!"):
        i += 1
    if i < len(lines) and "coding" in lines[i]:
        i += 1

    # Skip initial empty lines
    while i < len(lines) and lines[i].strip() == "":
        i += 1

    # Walk import block
    start = i
    while i < len(lines):
        line = lines[i].strip()
        if line.startswith("import ") or line.startswith("from "):
            i += 1
            continue
        break

    insert_at = i if i > start else 0
    lines.insert(insert_at, import_stmt)
    return "\n".join(lines) + ("\n" if code.endswith("\n") else "")


def _safe_rewrite_imports_to_source(test_code: str) -> str:
    """
    Only rewrite imports that look like placeholders for the user's module.
    Never rewrite library imports (flask, requests, unittest, etc).
    """
    def repl(m):
        mod = m.group(1)
        if mod in _ALLOWED_REWRITE_MODULES:
            return "from source import"
        return m.group(0)

    # rewrite: from app import X  -> from source import X (only for allowed modules)
    pattern = r"from\s+([A-Za-z_]\w*)\s+import"
    return re.sub(pattern, repl, test_code)


def _rewrite_patch_targets_to_source(test_code: str) -> str:
    mods = "|".join(map(re.escape, _ALLOWED_REWRITE_MODULES))
    # patch("app.x") / patch('app.x')
    test_code = re.sub(rf"(patch\(\s*['\"])({mods})\.", r"\1source.", test_code)
    # @patch("app.x")
    test_code = re.sub(rf"(@patch\(\s*['\"])({mods})\.", r"\1source.", test_code)
    return test_code


def _ensure_import(test_code: str, import_line: str) -> str:
    if re.search(rf"^{re.escape(import_line)}\s*$", test_code, re.MULTILINE):
        return test_code
    # insert after import pytest if present, else at top
    if "import pytest" in test_code:
        return test_code.replace("import pytest", f"import pytest\n{import_line}", 1)
    return f"{import_line}\n{test_code}"


def _detect_flask_app_var(source_code: str) -> Optional[str]:
    """
    Find variable name like: app = Flask(__name__)
    """
    m = re.search(r"^\s*([A-Za-z_]\w*)\s*=\s*Flask\s*\(", source_code, re.MULTILINE)
    return m.group(1) if m else None


def _inject_flask_client_fixture(test_code: str, flask_app_var: str) -> str:
    """
    Inject a pytest client fixture if tests reference `client` parameter but no fixture exists.
    """
    uses_client_arg = bool(re.search(r"def\s+test_\w+\s*\([^)]*\bclient\b[^)]*\)\s*:", test_code))
    has_client_fixture = bool(re.search(r"@pytest\.fixture[\s\S]*?\ndef\s+client\s*\(", test_code))

    if not uses_client_arg or has_client_fixture:
        return test_code

    fixture_code = f"""

@pytest.fixture
def client():
    from source import {flask_app_var} as _app
    _app.config["TESTING"] = True
    with _app.test_client() as c:
        yield c
"""
    # add after imports
    if "import pytest" in test_code:
        return test_code.replace("import pytest", f"import pytest{fixture_code}", 1)
    return f"import pytest{fixture_code}\n{test_code}"


def _split_source_files(source_code: str) -> Optional[Dict[str, str]]:
    """
    When source_code contains multiple files separated by:
        # File: filename.py          (Python / generic)
        // File: filename.ts         (JS / TS / Java)
    split them and return {filename: content}.
    Returns None if no markers are found (single-file mode).
    """
    # Match both comment styles: `# File:` and `// File:`
    marker_re = re.compile(
        r'^(?:#|//)\s*(?:===\s*)?File:\s*(.+?)(?:\s*===)?\s*$',
        re.MULTILINE | re.IGNORECASE,
    )
    markers = list(marker_re.finditer(source_code))
    if not markers:
        return None

    files: Dict[str, str] = {}
    for i, m in enumerate(markers):
        filename = m.group(1).strip()
        start = m.end()
        end = markers[i + 1].start() if i + 1 < len(markers) else len(source_code)
        content = source_code[start:end].lstrip('\n').rstrip()
        files[filename] = content

    return files if files else None


def _fix_multiline_with_statements(code: str) -> str:
    """
    Fix LLM-generated multi-line `with` statements where context managers
    span lines without backslash continuation or parentheses, e.g.:

        with patch('source.A', return_value=x),
             patch('source.B', return_value=y) as mock_b:

    becomes:

        with patch('source.A', return_value=x), \\
             patch('source.B', return_value=y) as mock_b:
    """
    lines = code.split('\n')
    result = []
    i = 0
    while i < len(lines):
        line = lines[i]
        rstripped = line.rstrip()
        # A `with` line that ends with a bare `,` — needs continuation
        # Conditions: matches `with ...`, ends with `,`, no backslash already,
        # and is NOT inside a parenthesised group (no unmatched `(` on the line
        # after the `with` keyword — a simple heuristic check).
        if (re.match(r'^\s*with\s+', rstripped)
                and rstripped.endswith(',')
                and not rstripped.endswith('\\')
                and rstripped.count('(') == rstripped.count(')')):
            # Collect this line and all continuation lines until `:` is found
            block = [rstripped]
            j = i + 1
            while j < len(lines):
                cont = lines[j].rstrip()
                if not cont.strip():
                    break
                block.append(cont)
                if cont.endswith(':') or cont.endswith(':\\'):
                    break
                j += 1

            # Only patch if the last collected line closes with ':'
            if block[-1].rstrip().endswith(':') and len(block) > 1:
                # Add backslash to every line except the last
                for k, bline in enumerate(block[:-1]):
                    result.append(bline + ' \\')
                result.append(block[-1])
                i = i + len(block)
                continue

        result.append(lines[i])
        i += 1
    return '\n'.join(result)


def _preprocess_python(test_code: str, source_code: str) -> (str, str):
    """
    Make Python execution more robust WITHOUT breaking valid code.
    """
    processed_test = test_code

    # 0a) Fix multi-line `with` statements where LLM forgot backslash continuation
    processed_test = _fix_multiline_with_statements(processed_test)

    # 0) Detect the user's actual source module name and rewrite imports to "source".
    #    Handles cases where the test imports from the real filename (e.g. my_utils, calculator)
    #    instead of the "source" placeholder used inside Docker.
    try:
        src_tree = ast.parse(source_code)
        source_top_defs: Set[str] = {
            node.name for node in src_tree.body
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef))
        }
    except SyntaxError:
        source_top_defs = set()

    # Also pick up the module name from a "# File: xxx.py" header if present
    user_source_modules: Set[str] = set()
    file_header_match = re.search(r'#\s*File:\s*([\w]+)\.py', source_code)
    if file_header_match:
        user_source_modules.add(file_header_match.group(1))

    if source_top_defs:
        try:
            test_tree = ast.parse(test_code)
            for node in ast.walk(test_tree):
                if isinstance(node, ast.ImportFrom) and node.module and node.level == 0:
                    mod = node.module.split('.')[0]
                    # Skip known non-user modules
                    if mod in _STDLIB_MODULES or mod in ('source',):
                        continue
                    for alias in node.names:
                        if alias.name == '*' or alias.name in source_top_defs:
                            user_source_modules.add(mod)
                            break
        except SyntaxError:
            pass

    # Rewrite "from <user_module> import X" → "from source import X"
    for user_mod in user_source_modules:
        processed_test = re.sub(
            rf"^\s*from\s+{re.escape(user_mod)}\s+import\s+",
            "from source import ",
            processed_test,
            flags=re.MULTILINE
        )
        # Also rewrite patch targets: patch("my_utils.foo") → patch("source.foo")
        processed_test = re.sub(rf"(patch\(\s*['\"]){re.escape(user_mod)}\.", r"\1source.", processed_test)
        processed_test = re.sub(rf"(@patch\(\s*['\"]){re.escape(user_mod)}\.", r"\1source.", processed_test)

    # 1) Safe rewrite placeholder imports only
    processed_test = _safe_rewrite_imports_to_source(processed_test)
    processed_test = _rewrite_patch_targets_to_source(processed_test)

    # Patch the correct target for the module under test
    processed_test = re.sub(r"patch\(\s*['\"]requests\.get['\"]\s*\)", "patch('source.requests.get')", processed_test)
    processed_test = re.sub(r"patch\(\s*['\"]requests\.request['\"]\s*\)", "patch('source.requests.request')", processed_test)

    # 2) Ensure needed imports if used
    # 2) Ensure needed imports if used
    if any(x in processed_test for x in ["@patch", "patch(", "mock_open"]):
        if "mock_open" in processed_test:
            processed_test = _ensure_import(processed_test, "from unittest.mock import patch, mock_open")
        else:
            processed_test = _ensure_import(processed_test, "from unittest.mock import patch")

    # If tests use Mock(), ensure it's imported
    needs_mock = re.search(r"\bMock\s*\(", processed_test) is not None
    has_mock = re.search(r"^\s*from\s+unittest\.mock\s+import\s+.*\bMock\b", processed_test, re.MULTILINE) is not None
    if needs_mock and not has_mock:
        # If there's already "from unittest.mock import patch", upgrade it
        if re.search(r"^\s*from\s+unittest\.mock\s+import\s+patch\s*$", processed_test, re.MULTILINE):
            processed_test = re.sub(
                r"^\s*from\s+unittest\.mock\s+import\s+patch\s*$",
                "from unittest.mock import patch, Mock",
                processed_test,
                flags=re.MULTILINE
            )
        else:
            processed_test = _ensure_import(processed_test, "from unittest.mock import Mock")

    if any(x in processed_test for x in ["os.", "os.environ", "os.getenv"]):
        processed_test = _ensure_import(processed_test, "import os")

    # If tests reference requests.*, ensure requests is imported
    if re.search(r"\brequests\.", processed_test) and not re.search(r"^\s*import\s+requests\b", processed_test, re.MULTILINE):
        processed_test = _ensure_import(processed_test, "import requests")

    # 3) Fix common __name__ typos in SOURCE (minimal)
    fixed_source = source_code
    fixed_source = re.sub(r"(?<![_])_name_(?![_])", "__name__", fixed_source)
    fixed_source = re.sub(r"(?<![_])___name___(?![_])", "__name__", fixed_source)

    # Add PEP 563 - Postponed Evaluation of Annotations (fixes forward reference issues in type hints)
    # This MUST be at the very beginning, before ANY code/comments except Python directives
    future_import = "from __future__ import annotations\n"
    if not fixed_source.startswith(future_import):
        # Only add if not already there
        fixed_source = future_import + fixed_source

    # 3.5) Convert relative imports to absolute imports
    # This is critical for integration testing when files are combined
    fixed_source = re.sub(r"^from\s+\.+(\w+)\s+import\s+", r"from \1 import ", fixed_source, flags=re.MULTILINE)
    fixed_source = re.sub(r"^import\s+\.+(\w+)\s+", r"import \1 ", fixed_source, flags=re.MULTILINE)

    # 3.6) Remove inter-module imports from combined source
    # When files are combined into source.py, imports like "from core import X" will fail
    # Extract module names that appear to be internal modules (e.g., "core", "shopping", "analytics")
    # and remove those imports since all code is now in one file
    lines = fixed_source.split('\n')
    filtered_lines = []
    removed_imports = set()  # Track what was removed for test code fixing
    for line in lines:
        # NEVER skip "from __future__" imports - these are critical Python directives
        if line.strip().startswith("from __future__"):
            filtered_lines.append(line)
            continue
            
        # Skip imports of likely internal modules (single word, no dots, not standard library)
        if re.match(r'^\s*from\s+(\w+)\s+import\s+', line):
            module_match = re.match(r'^\s*from\s+(\w+)\s+import\s+(.+)$', line)
            if module_match:
                module_name = module_match.group(1)
                imported_items = module_match.group(2)
                # Skip if it looks like an internal module (not a standard library)
                # Common stdlib: os, sys, re, json, datetime, unittest, pytest, etc.
                stdlib_modules = {'os', 'sys', 're', 'json', 'datetime', 'time', 'collections', 
                                 'functools', 'itertools', 'typing', 'unittest', 'pytest', 'logging',
                                 'pathlib', 'subprocess', 'tempfile', 'shutil', 'uuid', 'random',
                                 'math', 'decimal', 'statistics', 'hashlib', 'hmac', 'secrets',
                                 'urllib', 'requests', 'flask', 'django', 'sqlalchemy'}
                if module_name not in stdlib_modules:
                    # This is an internal module - skip it and track what was removed
                    removed_imports.add(module_name)
                    continue
        filtered_lines.append(line)
    fixed_source = '\n'.join(filtered_lines)
    
    # 3.7) Fix test code to import from source instead of internal modules
    for internal_module in removed_imports:
        # Replace "from internal_module import X" with "from source import X"
        processed_test = re.sub(
            rf"^\s*from\s+{re.escape(internal_module)}\s+import\s+",
            "from source import ",
            processed_test,
            flags=re.MULTILINE
        )

    # 4) If source uses os.* but forgot import os, add it
    if any(x in fixed_source for x in ["os.", "os.environ", "os.getenv"]) and not re.search(r"^import\s+os\b", fixed_source, re.MULTILINE):
        fixed_source = "import os\n" + fixed_source

    # 5) Flask fixture injection (if applicable)
    flask_var = _detect_flask_app_var(fixed_source)
    if flask_var:
        processed_test = _inject_flask_client_fixture(processed_test, flask_var)

    # 6) Auto-import functions/classes from source if missing (via AST)
    processed_test = _auto_import_from_source_if_missing(processed_test, fixed_source)

    return processed_test, fixed_source




# -----------------------------
# Java: framework detection + pom
# -----------------------------

def _detect_java_frameworks(test_code: str) -> (bool, bool):
    """
    Detect JUnit vs TestNG by imports, not @Test.
    """
    junit = bool(re.search(r"import\s+org\.junit(\.jupiter)?\.", test_code))
    testng = bool(re.search(r"import\s+org\.testng\.", test_code))
    return junit, testng


def generate_pom_xml(is_junit: bool, is_testng: bool, source_code: str, test_code: str = "", custom_deps: Optional[str] = None) -> str:
    # Fix: Only detect Spring Boot from SOURCE code to avoid self-reinforcing AI errors
    # If the user source code refers to Spring, then we add dependencies.
    is_spring_boot = (
        "org.springframework" in source_code
        or "@SpringBootApplication" in source_code
        or "@RestController" in source_code
        or "@Controller" in source_code
    )

    deps = []

    if is_spring_boot:
        logger.debug("Spring Boot detected in source/test. Adding dependencies.")
        deps.append("""
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-web</artifactId>
            <version>3.2.2</version>
        </dependency>
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-test</artifactId>
            <version>3.2.2</version>
            <scope>test</scope>
        </dependency>
        """)
    else:
        logger.debug("No Spring Boot detected. Source length: %s", len(source_code))

    # Always include JUnit 5 support for consistency
    deps.append("""
        <dependency>
            <groupId>org.junit.jupiter</groupId>
            <artifactId>junit-jupiter-api</artifactId>
            <version>5.10.0</version>
            <scope>test</scope>
        </dependency>
        <dependency>
            <groupId>org.junit.jupiter</groupId>
            <artifactId>junit-jupiter-engine</artifactId>
            <version>5.10.0</version>
            <scope>test</scope>
        </dependency>
        <dependency>
            <groupId>org.junit.platform</groupId>
            <artifactId>junit-platform-launcher</artifactId>
            <version>1.10.0</version>
            <scope>test</scope>
        </dependency>
    """)

    if is_testng:
        deps.append("""
        <dependency>
            <groupId>org.testng</groupId>
            <artifactId>testng</artifactId>
            <version>7.8.0</version>
            <scope>test</scope>
        </dependency>
        """)

    if custom_deps:
        deps.append(custom_deps)

    # Heuristic: Auto-detect Apache Commons Lang 3
    # Check if not already in custom_deps to avoid duplicates
    has_commons_in_custom = custom_deps and "commons-lang3" in custom_deps
    if not has_commons_in_custom and ("org.apache.commons.lang3" in source_code or "org.apache.commons.lang3" in test_code):
        logger.debug("Apache Commons Lang 3 detected. Adding dependency.")
        deps.append("""
        <dependency>
            <groupId>org.apache.commons</groupId>
            <artifactId>commons-lang3</artifactId>
            <version>3.14.0</version>
        </dependency>
        """)

    final_pom = f"""<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0
         http://maven.apache.org/xsd/maven-4.0.0.xsd">
  <modelVersion>4.0.0</modelVersion>

  <groupId>com.test</groupId>
  <artifactId>genai-test</artifactId>
  <version>1.0-SNAPSHOT</version>

  <properties>
    <maven.compiler.source>21</maven.compiler.source>
    <maven.compiler.target>21</maven.compiler.target>
    <project.build.sourceEncoding>UTF-8</project.build.sourceEncoding>
  </properties>

  <dependencies>
    {''.join(deps)}
  </dependencies>

  <build>
    <plugins>
      <plugin>
        <groupId>org.apache.maven.plugins</groupId>
        <artifactId>maven-surefire-plugin</artifactId>
        <version>3.2.5</version>
      </plugin>
    </plugins>
  </build>
</project>
"""
    logger.debug("Generated POM.xml content length: %s", len(final_pom))
    return final_pom



# -----------------------------
# Executors
# -----------------------------

def execute_java_tests(
    test_code: str,
    source_code: str,
    env_vars: Optional[Dict[str, str]],
    execution_mode: ExecutionMode,
    timeout: int,
    config: Dict,
    temp_dir: str,
    container_name: str,
    project_id: Optional[int] = None,
    custom_deps: Optional[str] = None
) -> Dict:
    try:
        src_main = os.path.join(temp_dir, "src", "main", "java", "com", "test")
        src_test = os.path.join(temp_dir, "src", "test", "java", "com", "test")
        os.makedirs(src_main, exist_ok=True)
        os.makedirs(src_test, exist_ok=True)

        class_match = re.search(r"public\s+class\s+(\w+)", source_code)
        source_class_name = class_match.group(1) if class_match else "Application"

        # Keep original for reference
        source_code_original = source_code

        # Force consistent package for compilation
        source_code = re.sub(r"^\s*package\s+[^;]+;", "package com.test;", source_code, flags=re.MULTILINE)
        if "package com.test;" not in source_code:
            source_code = "package com.test;\n\n" + source_code

        with open(os.path.join(src_main, f"{source_class_name}.java"), "w", encoding="utf-8") as f:
            f.write(source_code)

        # Spring boot helper only if needed and not already present
        if "@SpringBootApplication" not in source_code and "org.springframework" in source_code:
            app_class_code = """package com.test;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
public class TestApplication {
  public static void main(String[] args) {
    SpringApplication.run(TestApplication.class, args);
  }
}
"""
            with open(os.path.join(src_main, "TestApplication.java"), "w", encoding="utf-8") as f:
                f.write(app_class_code)

        # write test (ensure package and remove stale imports)
        # 1. Detect original package from source to remove it from test imports
        # original_package_match = re.search(r"^\s*package\s+([^;]+);", source_code_original, re.MULTILINE) # This line is removed
        # original_package = original_package_match.group(1).strip() if original_package_match else None # This line is removed

        pkg_stmt = "package com.test;"
        test_code = re.sub(r"^\s*package\s+[^;]+;", pkg_stmt, test_code, flags=re.MULTILINE)
        if "package com.test;" not in test_code:
            test_code = pkg_stmt + "\n\n" + test_code

        # Fix: Remove any import of the source class from ANY package (since we moved source to com.test)
        test_code = re.sub(rf"^\s*import\s+[\w\.]+\.{re.escape(source_class_name)}\s*;\s*$", "", test_code, flags=re.MULTILINE)

        # Fix: Ensure usages refer to com.test.<Class> via import
        if re.search(rf"\b{re.escape(source_class_name)}\b", test_code):
             if not re.search(rf"^\s*import\s+com\.test\.{re.escape(source_class_name)}\s*;", test_code, re.MULTILINE):
                 # insert import after package line
                 test_code = re.sub(r"^(package\s+com\.test;\s*)\n", r"\1\nimport com.test." + source_class_name + ";\n", test_code, flags=re.MULTILINE)

        test_class_match = re.search(r"public\s+class\s+(\w+)", test_code)
        test_class_name = test_class_match.group(1) if test_class_match else "GeneratedTest"

        with open(os.path.join(src_test, f"{test_class_name}.java"), "w", encoding="utf-8") as f:
            f.write(test_code)

        is_junit, is_testng = _detect_java_frameworks(test_code)
        # Fix: Default to JUnit if neither is strictly detected (avoids missing dependencies if imports are stripped)
        if not is_junit and not is_testng:
            is_junit = True
        
        pom = generate_pom_xml(is_junit, is_testng, source_code, test_code, custom_deps)
        with open(os.path.join(temp_dir, "pom.xml"), "w", encoding="utf-8") as f:
            f.write(pom)

        env_file = os.path.join(temp_dir, ".env")
        if env_vars:
            with open(env_file, "w", encoding="utf-8") as f:
                for k, v in env_vars.items():
                    f.write(f"{k}={v}\n")
            try:
                os.chmod(env_file, 0o600)
            except:
                pass

        # Use dynamic image selection
        image = _select_executor_image(source_code, test_code, "java", {}) 

        docker_cmd = [
            "docker", "run", "--rm",
            "--name", container_name,
            "--memory", "1g", "--cpus", "2.0",
        ]
        
        # Add Volume/Workdir args
        docker_cmd += _get_docker_mount_args(temp_dir)

        # US-2: Java Cache
        if project_id:
            logger.info(f"Mounting maven cache for project {project_id}")
            docker_cmd += ["-v", f"genai_project_{project_id}_m2_cache:/root/.m2"]

        if env_vars:
            docker_cmd += ["--env-file", env_file]

        # if execution_mode == ExecutionMode.UNIT:
        #    docker_cmd += ["--network", "none"]

        docker_cmd += [
            "genaiqa/java-basic:latest",
            "sh", "-c",
            "mvn clean test -Dstyle.color=never" # Remove -q, add color disable
        ]

        result = subprocess.run(
            docker_cmd, capture_output=True, text=True,
            encoding="utf-8", errors="replace", timeout=timeout
        )

        # Parse Surefire XML reports into structured JSON
        test_summary = {
            "total": 0,
            "passed": 0,
            "failed": 0,
            "skipped": 0,
            "failures": []
        }
        
        should_parse_xml = True
        try:
             import xml.etree.ElementTree as ET
        except ImportError:
             should_parse_xml = False

        surefire_dir = os.path.join(temp_dir, "target", "surefire-reports")
        xml_reports = [] # Initialize xml_reports
        if should_parse_xml and os.path.exists(surefire_dir):
            for f in os.listdir(surefire_dir):
                if f.endswith(".xml"):
                    try:
                        tree = ET.parse(os.path.join(surefire_dir, f))
                        root = tree.getroot()
                        xml_reports.append(ET.tostring(root, encoding='unicode')) # Store raw XML content
                        
                        test_summary["total"] += int(root.get("tests", 0))
                        failures = int(root.get("failures", 0))
                        errors = int(root.get("errors", 0))
                        skipped = int(root.get("skipped", 0))
                        
                        test_summary["failed"] += failures + errors
                        test_summary["skipped"] += skipped
                        
                        # Extract failure details
                        for testcase in root.findall("testcase"):
                            name = testcase.get("name")
                            classname = testcase.get("classname")
                            
                            failure_elem = testcase.find("failure")
                            error_elem = testcase.find("error")
                            
                            if failure_elem is not None:
                                msg = failure_elem.get("message") or failure_elem.text or "Assertion Failed"
                                test_summary["failures"].append(f"{classname}.{name}: {msg}")
                            elif error_elem is not None:
                                msg = error_elem.get("message") or error_elem.text or "Error"
                                test_summary["failures"].append(f"{classname}.{name}: {msg}")
                                
                    except Exception:
                        logger.debug("Failed to parse XML %s", f)

        test_summary["passed"] = test_summary["total"] - test_summary["failed"] - test_summary["skipped"]
        
        # Determine success based on exit code AND presence of failures in output/XML
        success = (result.returncode == 0) and (test_summary["failed"] == 0 if test_summary["total"] > 0 else True)
        
        return {
            "success": success,
            "output": result.stdout,
            "errors": result.stderr,
            "exit_code": result.returncode,
            "xml_reports": xml_reports,
            "test_results_json": test_summary # Structured data for frontend
        }

    except subprocess.TimeoutExpired:
        subprocess.run(["docker", "kill", container_name], capture_output=True, check=False)
        return {"success": False, "exit_code": -1, "output": "", "errors": f"Execution timed out after {timeout}s"}
    except Exception as e:
        return {"success": False, "exit_code": -1, "output": "", "errors": str(e)}



# ──────────────────────────────────────────────────────────────────────────────
# JavaScript / TypeScript test-output parsers
# ──────────────────────────────────────────────────────────────────────────────

def _parse_jest_json(raw: str) -> Optional[Dict]:
    """
    Extract the Jest --json blob from stdout.
    Jest writes the JSON after any console output, so we look for the opening
    `{` that belongs to the JSON object and grab everything from there.
    Returns the parsed dict, or None if not found / invalid.
    """
    # Jest JSON starts with the root object key "numFailedTestSuites"
    idx = raw.find('"numFailedTestSuites"')
    if idx == -1:
        idx = raw.find('"testResults"')
    if idx == -1:
        return None
    # Find the opening brace before that key
    brace_idx = raw.rfind('{', 0, idx)
    if brace_idx == -1:
        return None
    try:
        return json.loads(raw[brace_idx:])
    except Exception:
        return None


def _jest_json_to_tests(data: Dict) -> list:
    """Convert parsed Jest JSON to our internal tests list."""
    tests = []
    for suite in data.get("testResults", []):
        for t in suite.get("testResults", []):
            name = t.get("fullName") or t.get("title") or "unknown"
            status_raw = t.get("status", "unknown")
            status = "passed" if status_raw == "passed" else "failed"
            duration = t.get("duration") or 0
            failure_msgs = t.get("failureMessages", [])
            error = "\n".join(failure_msgs) if failure_msgs else None
            tests.append({
                "name": name,
                "status": status,
                "duration": int(duration),
                "description": name,
                "error": error,
            })
    return tests


def _parse_mocha_json(raw: str) -> Optional[Dict]:
    """
    Extract the Mocha JSON blob from output.
    First tries the ===MOCHA_JSON_START=== / ===MOCHA_JSON_END=== delimiters
    written by the updated npm script.  Falls back to scanning for the
    'stats' key (legacy / plain --reporter json to stdout).
    """
    # ── fast path: delimited block ──────────────────────────────────────────
    # Use rfind so we skip the npm command-echo line that also contains the
    # literal marker text and pick up the ACTUAL output echo instead.
    start_marker = "===MOCHA_JSON_START==="
    end_marker   = "===MOCHA_JSON_END==="
    si = raw.rfind(start_marker)
    ei = raw.rfind(end_marker)
    if si != -1 and ei != -1 and ei > si:
        blob = raw[si + len(start_marker):ei].strip()
        if blob and blob != "{}":
            try:
                return json.loads(blob)
            except Exception:
                pass

    # ── fallback: find the stats key in raw output ──────────────────────────
    idx = raw.find('"stats"')
    if idx == -1:
        return None
    brace_idx = raw.rfind('{', 0, idx)
    if brace_idx == -1:
        return None
    try:
        decoder = json.JSONDecoder()
        obj, _ = decoder.raw_decode(raw, brace_idx)
        return obj
    except Exception:
        return None


def _mocha_json_to_tests(data: Dict) -> list:
    """Convert parsed Mocha JSON to our internal tests list."""
    tests = []
    for t in data.get("passes", []):
        title = t.get("fullTitle") or t.get("title") or "unknown"
        tests.append({
            "name": title,
            "status": "passed",
            "duration": int(t.get("duration") or 0),
            "description": title,
            "error": None,
        })
    for t in data.get("failures", []):
        title = t.get("fullTitle") or t.get("title") or "unknown"
        err_obj = t.get("err", {})
        msg = err_obj.get("message") or err_obj.get("stack") or str(err_obj) or "Test failed"
        tests.append({
            "name": title,
            "status": "failed",
            "duration": int(t.get("duration") or 0),
            "description": title,
            "error": msg,
        })
    for t in data.get("pending", []):
        title = t.get("fullTitle") or t.get("title") or "unknown"
        tests.append({
            "name": title,
            "status": "failed",
            "duration": 0,
            "description": title,
            "error": "Test was pending/skipped",
        })
    return tests


def _parse_jasmine_text(raw: str) -> list:
    """
    Parse Jasmine's verbose text output into a tests list.
    Jasmine text looks like:
      ✓ testAdd - adds two numbers
      ✗ testSubtract - subtracts correctly
        Expected 1 to equal 2.
    """
    tests = []
    lines = raw.splitlines()
    i = 0
    while i < len(lines):
        line = lines[i].strip()
        # Passed: ✓ or ✔ or "passing" prefix patterns
        passed_match = re.match(r'[✓✔√]\s+(.+)', line)
        # Failed: ✗ or ✘ or × or "failing"
        failed_match = re.match(r'[✗✘×]\s+(.+)', line)
        if passed_match:
            name = passed_match.group(1).strip()
            tests.append({"name": name, "status": "passed", "duration": 0,
                          "description": name, "error": None})
        elif failed_match:
            name = failed_match.group(1).strip()
            # Collect the following indented error lines
            err_lines = []
            i += 1
            while i < len(lines):
                next_line = lines[i]
                if next_line.startswith('  ') or next_line.startswith('\t'):
                    err_lines.append(next_line.strip())
                    i += 1
                else:
                    break
            error = "\n".join(err_lines) if err_lines else "Test failed"
            tests.append({"name": name, "status": "failed", "duration": 0,
                          "description": name, "error": error})
            continue
        i += 1
    return tests


def _parse_jest_text(raw: str) -> list:
    """
    Fallback: parse Jest verbose text output when --json blob is unavailable.
    Lines like:  ✓ testAdd (2 ms)  or  ✕ testFail (1 ms)
    """
    tests = []
    for line in raw.splitlines():
        stripped = line.strip()
        # Passed: ✓ or √ or ●
        p = re.match(r'[✓✔√]\s+(.+?)(?:\s+\(\d+\s*ms\))?$', stripped)
        f = re.match(r'[✕×✗●]\s+(.+?)(?:\s+\(\d+\s*ms\))?$', stripped)
        dur_match = re.search(r'\((\d+)\s*ms\)', stripped)
        dur = int(dur_match.group(1)) if dur_match else 0
        if p:
            name = p.group(1).strip()
            tests.append({"name": name, "status": "passed", "duration": dur,
                          "description": name, "error": None})
        elif f:
            name = f.group(1).strip()
            tests.append({"name": name, "status": "failed", "duration": dur,
                          "description": name, "error": "See output for details"})
    return tests


def _build_js_test_results(tests: list, raw_output: str = "") -> Dict:
    """
    Build the test_results_json structure expected by the route handler.
    Includes both legacy summary fields AND a full `tests` array.
    """
    total = len(tests)
    passed = sum(1 for t in tests if t["status"] == "passed")
    failed = total - passed
    failures = [f"{t['name']}: {t['error']}" for t in tests if t["status"] == "failed" and t.get("error")]
    return {
        "total": total,
        "passed": passed,
        "failed": failed,
        "skipped": 0,
        "failures": failures,   # legacy field (used by Java path too)
        "tests": tests,         # rich per-test data for JS
    }


def _convert_esm_to_cjs(code: str) -> str:
    """
    Rewrite ESM import/export statements to CommonJS so plain .js files
    run without Node's ESM resolver (which requires explicit extensions).

    Handles:
      import { a, b } from './x'  →  const { a, b } = require('./x')
      import X from './x'         →  const X = require('./x')
      import * as X from './x'    →  const X = require('./x')
      export default X            →  module.exports = X
      export { a, b }             →  module.exports = { a, b }
    """
    # named: import { a, b as c } from '...'
    code = re.sub(
        r"^import\s*\{([^}]+)\}\s*from\s*['\"]([^'\"]+)['\"]",
        lambda m: f"const {{{m.group(1)}}} = require('{m.group(2)}')",
        code, flags=re.MULTILINE,
    )
    # namespace: import * as X from '...'
    code = re.sub(
        r"^import\s*\*\s*as\s+(\w+)\s+from\s*['\"]([^'\"]+)['\"]",
        lambda m: f"const {m.group(1)} = require('{m.group(2)}')",
        code, flags=re.MULTILINE,
    )
    # default: import X from '...'
    code = re.sub(
        r"^import\s+(\w+)\s+from\s*['\"]([^'\"]+)['\"]",
        lambda m: f"const {m.group(1)} = require('{m.group(2)}')",
        code, flags=re.MULTILINE,
    )
    # side-effect: import '...'
    code = re.sub(
        r"^import\s*['\"]([^'\"]+)['\"]",
        lambda m: f"require('{m.group(1)}')",
        code, flags=re.MULTILINE,
    )
    # export default
    code = re.sub(r"^export\s+default\s+", "module.exports = ", code, flags=re.MULTILINE)
    # export { a, b }
    code = re.sub(
        r"^export\s*\{([^}]+)\}",
        lambda m: f"module.exports = {{{m.group(1)}}}",
        code, flags=re.MULTILINE,
    )
    # export function / export class / export const …
    code = re.sub(r"^export\s+((?:async\s+)?(?:function|class|const|let|var))", r"\1", code, flags=re.MULTILINE)
    return code


def execute_javascript_tests(
    test_code: str,
    source_code: str,
    language: str,
    env_vars: Optional[Dict[str, str]],
    execution_mode: ExecutionMode,
    timeout: int,
    config: Dict,
    temp_dir: str,
    container_name: str,
    project_id: Optional[int] = None
) -> Dict:
    """
    Execute JavaScript / TypeScript tests inside the genaiqa/javascript-basic Docker image.
    Supports Jest, Mocha, and Jasmine frameworks.
    """
    try:
        # ── 1. Framework detection (config > code heuristics) ──────────────────
        cfg_framework = (config or {}).get("framework", "").lower()
        if cfg_framework in ("jest", "mocha", "jasmine"):
            is_jest = cfg_framework == "jest"
            is_mocha = cfg_framework == "mocha"
            is_jasmine = cfg_framework == "jasmine"
        else:
            test_lower = test_code.lower()
            is_jasmine = "jasmine" in test_lower
            # Chai assertions use .to.equal / .to.be / .to.throw etc.
            # Jest uses .toBe / .toEqual — the "to." prefix is a Chai/Mocha tell.
            has_chai_style = bool(re.search(r'\.to\.(equal|be|have|throw|include|deep)', test_lower))
            # Mocha: has describe+it AND (explicit mocha import, OR Chai-style, OR
            # no jest globals AND no jest-style matchers)
            is_mocha = (not is_jasmine) and (
                "mocha" in test_lower
                or "chai" in test_lower
                or has_chai_style
                or (
                    "describe(" in test_code
                    and "it(" in test_code
                    and "jest." not in test_lower
                    and not re.search(r'\.tobe\(|\.toequal\(|\.tomatch\(', test_lower)
                )
            )
            is_jest = not is_jasmine and not is_mocha

        is_typescript = language == "typescript"
        ext = "ts" if is_typescript else "js"

        # ── 2. Write source + test files ───────────────────────────────────────
        source_files = _split_source_files(source_code)
        is_multi_file_js = source_files is not None

        if is_multi_file_js:
            # Multi-file mode: write each source file with its real name so
            # test imports (e.g. `import { foo } from './utils'`) resolve correctly.
            for fname, fcontent in source_files.items():
                fpath = os.path.join(temp_dir, fname)
                if os.path.dirname(fname):
                    os.makedirs(os.path.join(temp_dir, os.path.dirname(fname)), exist_ok=True)
                # For plain JS, still convert ESM → CJS in each source file
                if not is_typescript:
                    fcontent = _convert_esm_to_cjs(fcontent)
                with open(fpath, "w", encoding="utf-8") as f:
                    f.write(fcontent)
            # Test file: convert ESM → CJS for plain JS only
            if not is_typescript:
                test_code = _convert_esm_to_cjs(test_code)
        else:
            # Single-file mode: write source as source.{ext}
            if not is_typescript:
                test_code   = _convert_esm_to_cjs(test_code)
                source_code = _convert_esm_to_cjs(source_code)
            with open(os.path.join(temp_dir, f"source.{ext}"), "w", encoding="utf-8") as f:
                f.write(source_code)

        with open(os.path.join(temp_dir, f"test.{ext}"), "w", encoding="utf-8") as f:
            f.write(test_code)

        # ── 3. tsconfig.json (TypeScript only) ────────────────────────────────
        if is_typescript:
            tsconfig = {
                "compilerOptions": {
                    "target": "ES2019",
                    "module": "commonjs",
                    "strict": False,
                    "esModuleInterop": True,
                    "allowSyntheticDefaultImports": True,
                    "moduleResolution": "node",
                    "skipLibCheck": True,
                    # Point TypeScript at the globally-installed @types packages
                    # so imports like 'chai', 'mocha' etc. resolve correctly
                    "typeRoots": [
                        "/usr/local/lib/node_modules/@types",
                        "/usr/local/lib/node_modules",
                    ],
                },
                "include": [f"*.{ext}"],
                "exclude": ["node_modules"],
            }
            with open(os.path.join(temp_dir, "tsconfig.json"), "w", encoding="utf-8") as f:
                json.dump(tsconfig, f, indent=2)

        # ── 4. Build package.json ──────────────────────────────────────────────
        # NOTE: Do NOT set "type":"module" — it breaks CommonJS require()
        pkg: Dict = {"name": "genai-test", "version": "1.0.0", "private": True, "scripts": {}}

        if is_jest:
            jest_cfg: Dict = {
                "testEnvironment": "node",
                "testMatch": [f"**/test.{ext}"],
                "verbose": True,
                "forceExit": True,
            }
            if is_typescript:
                jest_cfg["preset"] = "ts-jest"
                jest_cfg["globals"] = {"ts-jest": {"tsconfig": {"strict": False, "esModuleInterop": True}}}
            pkg["jest"] = jest_cfg
            # --json writes structured output; --outputFile places it in /tmp so it
            # doesn't conflict with mounted source files
            pkg["scripts"]["test"] = (
                f"jest --json --outputFile=/tmp/jest-results.json test.{ext} ; "
                f"echo '===JEST_JSON_START===' ; "
                f"cat /tmp/jest-results.json 2>/dev/null || echo '{{}}' ; "
                f"echo '===JEST_JSON_END==='"
            )

        elif is_mocha:
            # Redirect mocha's stdout (JSON) directly to a temp file.
            # Stderr (ts-node errors, compile warnings) flows normally and is
            # captured by docker's 2>&1.  After mocha finishes we echo the file
            # with delimiters so _parse_mocha_json can find it reliably.
            # TS_NODE_TRANSPILE_ONLY skips type-checking so TS type errors don't
            # prevent the suite from running.
            mocha_require = "--require ts-node/register " if is_typescript else ""
            ts_env = "TS_NODE_TRANSPILE_ONLY=true " if is_typescript else ""
            pkg["scripts"]["test"] = (
                f"{ts_env}mocha --reporter json "
                f"{mocha_require}"
                f"test.{ext} 1>/tmp/mocha-results.json ; "
                f"echo '===MOCHA_JSON_START===' ; "
                f"cat /tmp/mocha-results.json 2>/dev/null || echo '{{}}' ; "
                f"echo '===MOCHA_JSON_END==='"
            )

        else:  # Jasmine
            jasmine_conf = {
                "spec_dir": ".",
                "spec_files": [f"test.{ext}"],
                "stopSpecOnExpectationFailure": False,
                "random": False,
            }
            with open(os.path.join(temp_dir, "jasmine.json"), "w", encoding="utf-8") as f:
                json.dump(jasmine_conf, f, indent=2)
            runner = "ts-node node_modules/.bin/jasmine" if is_typescript else "jasmine"
            pkg["scripts"]["test"] = f"{runner} --config=jasmine.json"

        with open(os.path.join(temp_dir, "package.json"), "w", encoding="utf-8") as f:
            json.dump(pkg, f, indent=2)

        # ── 5. .env file ───────────────────────────────────────────────────────
        env_file = os.path.join(temp_dir, ".env")
        if env_vars:
            with open(env_file, "w", encoding="utf-8") as f:
                for k, v in env_vars.items():
                    f.write(f"{k}={v}\n")
            try:
                os.chmod(env_file, 0o600)
            except Exception:
                pass

        # ── 6. Docker command ──────────────────────────────────────────────────
        docker_cmd = [
            "docker", "run", "--rm",
            "--name", container_name,
            "--memory", "512m", "--cpus", "1.0",
        ]
        docker_cmd += _get_docker_mount_args(temp_dir)

        if env_vars:
            docker_cmd += ["--env-file", env_file]

        if execution_mode == ExecutionMode.UNIT:
            docker_cmd += ["--network", "none"]

        docker_cmd += ["genaiqa/javascript-basic:latest", "sh", "-c", "npm test 2>&1"]

        logger.debug(f"[JS-EXEC] framework: jest={is_jest} mocha={is_mocha} jasmine={is_jasmine} ts={is_typescript}")
        logger.debug(f"[JS-EXEC] npm test script: {pkg['scripts'].get('test', '')}")

        result = subprocess.run(
            docker_cmd, capture_output=True, text=True,
            encoding="utf-8", errors="replace", timeout=timeout,
        )

        raw = result.stdout + "\n" + result.stderr

        logger.debug(f"[JS-EXEC] exit_code={result.returncode}")
        logger.debug(f"[JS-EXEC] stdout:\n{result.stdout[:4000]}")
        if result.stderr:
            logger.debug(f"[JS-EXEC] stderr:\n{result.stderr[:1000]}")

        # ── 7. Parse output into structured tests ──────────────────────────────
        parsed_tests: list = []

        if is_jest:
            # Try the delimited JSON block first
            start_marker = "===JEST_JSON_START==="
            end_marker = "===JEST_JSON_END==="
            si = raw.find(start_marker)
            ei = raw.find(end_marker)
            logger.debug(f"[JS-EXEC] jest markers found: start={si} end={ei}")
            if si != -1 and ei != -1:
                blob = raw[si + len(start_marker):ei].strip()
                logger.debug(f"[JS-EXEC] jest json blob (200 chars): {blob[:200]}")
                try:
                    jest_data = json.loads(blob)
                    parsed_tests = _jest_json_to_tests(jest_data)
                except Exception as e:
                    logger.debug(f"[JS-EXEC] jest json parse error: {e}")
            # Fallback: try finding the JSON anywhere in the output
            if not parsed_tests:
                jest_data = _parse_jest_json(raw)
                if jest_data:
                    parsed_tests = _jest_json_to_tests(jest_data)
            # Final fallback: parse verbose text
            if not parsed_tests:
                parsed_tests = _parse_jest_text(raw)

        elif is_mocha:
            start_marker = "===MOCHA_JSON_START==="
            end_marker   = "===MOCHA_JSON_END==="
            # Use rfind so we skip the npm command-echo line that also contains
            # the literal marker text and find the ACTUAL echoed output instead.
            si = raw.rfind(start_marker)
            ei = raw.rfind(end_marker)
            logger.debug(f"[JS-EXEC] mocha markers found: start={si} end={ei}")
            if si != -1 and ei != -1 and ei > si:
                blob = raw[si + len(start_marker):ei].strip()
                logger.debug(f"[JS-EXEC] mocha json blob (500 chars): {blob[:500]}")
            mocha_data = _parse_mocha_json(raw)
            logger.debug(f"[JS-EXEC] mocha_data keys: {list(mocha_data.keys()) if mocha_data else 'None'}")
            if mocha_data:
                parsed_tests = _mocha_json_to_tests(mocha_data)
            logger.debug(f"[JS-EXEC] parsed_tests after mocha json: {len(parsed_tests)}")
            if parsed_tests:
                logger.debug(f"[JS-EXEC] first test: {parsed_tests[0]}")
            if not parsed_tests:
                # text fallback — mocha uses similar ✓/✗ symbols
                parsed_tests = _parse_jest_text(raw)
                logger.debug(f"[JS-EXEC] parsed_tests after text fallback: {len(parsed_tests)}")
            # If still no tests, synthesise an error entry so the frontend
            # shows something useful (exit_code may be 0 if the shell echo ran ok
            # even though mocha itself never executed).
            if not parsed_tests:
                # Check whether mocha actually produced any JSON output
                has_mocha_stats = '"stats"' in raw or '"passes"' in raw
                if not has_mocha_stats:
                    # Extract the real error from the raw output (skip npm echo line)
                    lines = raw.splitlines()
                    error_lines = [l for l in lines if l.strip()
                                   and not l.startswith("> ")
                                   and "MOCHA_JSON" not in l]
                    error_detail = "\n".join(error_lines[:30]).strip() or "Test suite failed to run"
                    logger.debug(f"[JS-EXEC] synthesising error entry: {error_detail[:200]}")
                    parsed_tests = [{
                        "name": "Test suite failed to run",
                        "status": "failed",
                        "duration": 0,
                        "description": "The test suite could not be executed.",
                        "error": error_detail[:2000],
                    }]

        else:  # Jasmine
            parsed_tests = _parse_jasmine_text(raw)
            if not parsed_tests:
                parsed_tests = _parse_jest_text(raw)

        logger.debug(f"[JS-EXEC] final parsed_tests count: {len(parsed_tests)}")
        test_results_json = _build_js_test_results(parsed_tests, raw)

        success = result.returncode == 0
        if test_results_json["total"] > 0:
            success = test_results_json["failed"] == 0

        return {
            "success": success,
            "output": result.stdout,
            "errors": result.stderr,
            "exit_code": result.returncode,
            "xml_reports": [],
            "test_results_json": test_results_json,
        }

    except subprocess.TimeoutExpired:
        subprocess.run(["docker", "kill", container_name], capture_output=True, check=False)
        return {"success": False, "exit_code": -1, "output": "", "errors": f"Execution timed out after {timeout}s"}
    except Exception as e:
        return {"success": False, "exit_code": -1, "output": "", "errors": str(e)}





def execute_tests_in_docker(
    test_code: str,
    source_code: str,
    language: str = "python",
    env_vars: Optional[Dict[str, str]] = None,
    execution_mode: ExecutionMode = ExecutionMode.UNIT,
    timeout: int = 120,
    config: Optional[Dict] = None,
    project_id: Optional[int] = None,
    requirements: Optional[str] = None,
    custom_deps: Optional[str] = None
) -> Dict:
    container_name = f"genai-test-{uuid.uuid4().hex[:8]}"
    temp_dir = None
    config = config or {}

    try:
        use_named_volume = bool(SHARED_WORK_DIR and DOCKER_VOLUME_NAME)

        if use_named_volume:
             # Production: Create unique subdir in shared volume
             job_id = uuid.uuid4().hex
             temp_dir = os.path.join(SHARED_WORK_DIR, job_id)
             os.makedirs(temp_dir, exist_ok=True)
        else:
             # Local: Use system temp dir
             temp_dir = tempfile.mkdtemp(prefix="genai_exec_")

        detected_language = _detect_language(source_code, test_code, language)
        logger.info(f"Language detected: '{detected_language}' (raw input: '{language}')")

        # Route java/js early
        if detected_language == "java":
            return execute_java_tests(
                test_code=test_code,
                source_code=source_code,
                env_vars=env_vars,
                execution_mode=execution_mode,
                timeout=timeout,
                config=config,
                temp_dir=temp_dir,
                container_name=container_name,
                project_id=project_id,
                custom_deps=custom_deps
            )

        if detected_language in ("javascript", "typescript"):
            return execute_javascript_tests(
                test_code=test_code,
                source_code=source_code,
                language=detected_language,
                env_vars=env_vars,
                execution_mode=execution_mode,
                timeout=timeout,
                config=config,
                temp_dir=temp_dir,
                container_name=container_name,
                project_id=project_id
            )

        # --- Python path ---
        source_files = _split_source_files(source_code)
        is_multi_file_python = source_files is not None

        if is_multi_file_python:
            # Multi-file mode: write each source file with its real name
            for fname, fcontent in source_files.items():
                fpath = os.path.join(temp_dir, fname)
                parent = os.path.dirname(fpath)
                if parent and parent != temp_dir:
                    os.makedirs(parent, exist_ok=True)
                with open(fpath, "w", encoding="utf-8") as f:
                    f.write(fcontent)
            # conftest.py ensures /app is on sys.path so test imports work
            conftest_path = os.path.join(temp_dir, "conftest.py")
            with open(conftest_path, "w", encoding="utf-8") as f:
                f.write("import sys, os\nsys.path.insert(0, os.path.dirname(__file__))\n")
            # For the test: apply syntax fixes but NOT import rewriting (imports use real names)
            processed_test = _fix_multiline_with_statements(test_code)
            fixed_source = ""  # not used in multi-file mode
        else:
            processed_test, fixed_source = _preprocess_python(test_code, source_code)
            source_file = os.path.join(temp_dir, "source.py")
            with open(source_file, "w", encoding="utf-8") as f:
                f.write(fixed_source)

        test_file = os.path.join(temp_dir, "test.py")
        with open(test_file, "w", encoding="utf-8") as f:
            f.write(processed_test)

        # US-1: Python requirements — merge user-supplied + auto-detected
        # In multi-file mode the source filenames (e.g. "database.py") are local
        # modules — exclude them so pip doesn't try to install them as packages.
        local_modules: Set[str] = set()
        if is_multi_file_python:
            for fname in source_files:
                base = os.path.splitext(os.path.basename(fname))[0]
                local_modules.add(base)

        auto_req = _auto_detect_pip_requirements(processed_test, exclude=local_modules)
        if is_multi_file_python:
            for fcontent in source_files.values():
                extra = _auto_detect_pip_requirements(fcontent, exclude=local_modules)
                auto_req = _merge_requirements(auto_req, extra)
        merged_requirements = _merge_requirements(requirements, auto_req)
        req_file_path = None
        if merged_requirements:
            req_file_path = os.path.join(temp_dir, "requirements.txt")
            with open(req_file_path, "w", encoding="utf-8") as f:
                f.write(merged_requirements)
            logger.info(f"requirements.txt: {merged_requirements.strip()}")

        env_file = os.path.join(temp_dir, ".env")
        if env_vars:
            with open(env_file, "w", encoding="utf-8") as f:
                for k, v in env_vars.items():
                    f.write(f"{k}={v}\n")
            try:
                os.chmod(env_file, 0o600)
            except:
                pass

        docker_image = _select_executor_image(source_code, processed_test, "python", config)
        logger.info(f"Selected executor image: {docker_image}")

        docker_cmd = [
            "docker", "run", "--rm",
            "--name", container_name,
            "--memory", "512m", "--cpus", "1.0",
             # Removed --read-only to allow pip install if needed (or generally for simplicity)
            "--tmpfs", "/tmp:rw,noexec,nosuid,size=150m",
            # critical for read-only stability:
            "-e", "PYTHONDONTWRITEBYTECODE=1",
            "-e", "PYTHONPYCACHEPREFIX=/tmp/pycache",
        ]
        
        # Add Volume/Workdir args (Generic mount instead of file-specific)
        docker_cmd += _get_docker_mount_args(temp_dir)

        if env_vars:
            docker_cmd += ["--env-file", env_file]

        # Network Isolation Strategy
        # Only block network if:
        # 1. It's a UNIT test
        # 2. No dynamic requirements (pip install needs net)
        # 3. Config doesn't explicitly ask for it
        allow_network = (merged_requirements is not None) or (config or {}).get("allow_network", False)
        
        if execution_mode == ExecutionMode.UNIT and not allow_network:
            docker_cmd += ["--network", "none"]

        # disable pytest cache provider to avoid writes to /app
        pytest_cmd = "python -m pytest test.py -v --tb=short --maxfail=0 -p no:cacheprovider"
        pytest_cmd_with_debug = pytest_cmd

        if project_id:
             logger.info(f"Mounting pip cache for project {project_id}")
             docker_cmd += ["-v", f"genai_project_{project_id}_pip_cache:/root/.cache/pip"]

        if merged_requirements and req_file_path:
            # requirements.txt is already in temp_dir, and temp_dir is mounted (either /app or /workspace/<job>)
            script = f"pip install -r requirements.txt && {pytest_cmd_with_debug}"
            docker_cmd += [docker_image, "sh", "-c", script]
        else:
            docker_cmd += [docker_image, "sh", "-c", pytest_cmd_with_debug]

        result = subprocess.run(
            docker_cmd, capture_output=True, text=True,
            encoding="utf-8", errors="replace", timeout=timeout
        )

        return {
            "success": result.returncode == 0,
            "exit_code": result.returncode,
            "output": result.stdout,
            "errors": result.stderr,
            "container_name": container_name
        }

    except subprocess.TimeoutExpired:
        subprocess.run(["docker", "kill", container_name], capture_output=True, check=False)
        return {"success": False, "exit_code": -1, "output": "", "errors": f"Execution timed out after {timeout}s"}
    except Exception as e:
        return {"success": False, "exit_code": -1, "output": "", "errors": str(e)}
    finally:
        if temp_dir and os.path.exists(temp_dir):
            try:
                # Cleanup: In production volume mode, we should also delete the dir
                shutil.rmtree(temp_dir)
            except Exception as e:
                logger.error(f"Failed to clean up temp dir: {e}")
