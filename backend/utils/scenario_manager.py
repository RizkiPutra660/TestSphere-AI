import json
import re
from typing import List, Dict, Any, Tuple, Optional


class ScenarioManager:
    """
    Manages LLM-generated test scenarios, reconstruction, and parsing.
    Note:
        This version assumes the LLM returns structured fields:
        - imports
        - setup_code
        - teardown_code
        - scenarios[]
    """

    # ----------------------------------------------------------------------
    # Helper: Decode escape sequences from LLM
    # ----------------------------------------------------------------------
    @staticmethod
    def unescape_code(code_str: str) -> str:
        """
        Convert escaped newlines and other escape sequences from LLM response
        into actual characters. The LLM returns strings with \\n as text,
        which need to be converted to actual newlines.
        """
        if not code_str:
            return code_str
        
        # Decode common escape sequences
        return code_str.replace('\\n', '\n').replace('\\t', '\t').replace('\\r', '\r')

    # ----------------------------------------------------------------------
    # 1. Extract metadata and scenarios from LLM STRUCTURED OUTPUT
    # ----------------------------------------------------------------------
    @staticmethod
    def parse_llm_response(llm_json: Dict[str, Any]) -> Tuple[Dict, List[Dict]]:
        """
        Safely parse metadata + scenarios from LLM response JSON.
        Ensures no missing fields break backend logic.
        Unescapes newlines and other escape sequences from code strings.
        """
        # Handle imports as either string (Python) or list (Java)
        imports_raw = llm_json.get("imports", "")
        if isinstance(imports_raw, list):
            # Java format: list of import statements
            imports_str = '\n'.join(imports_raw)
        else:
            # Python format: string with newlines
            imports_str = ScenarioManager.unescape_code(imports_raw).strip()
        
        language = llm_json.get("language", "python")
        
        # Java is sensitive to unescaping \\n inside strings (causes "unclosed string literal")
        # Python also might be, but let's strictly fix Java first. 
        # Modern LLMs producing valid JSON don't need manual unescaping usually.
        should_unescape = (language.lower() != "java")

        metadata = {
            "language": language,
            "imports": imports_str,
            "package_name": llm_json.get("package_name", ""),
            "class_name": llm_json.get("class_name", ""),
            "source_package": llm_json.get("source_package", ""),
            "source_class": llm_json.get("source_class", ""),
            "class_annotations": llm_json.get("class_annotations", []),
            "fields": llm_json.get("fields", []),
            "test_framework": llm_json.get("test_framework", ""),
            "spring_test_type": llm_json.get("spring_test_type", ""),
            "setup_code": ScenarioManager.unescape_code(llm_json.get("setup_code", "")).strip() if should_unescape else llm_json.get("setup_code", "").strip(),
            "teardown_code": ScenarioManager.unescape_code(llm_json.get("teardown_code", "")).strip() if should_unescape else llm_json.get("teardown_code", "").strip(),
            "summary": llm_json.get("summary", ""),
            "generated_with_config": llm_json.get("config", {}),
        }


        scenarios = []
        for idx, s in enumerate(llm_json.get("scenarios", [])):
            # Handle both 'code' (Python) and 'test_code' (Java) field names
            code_raw = s.get("test_code") or s.get("code", "")
            if should_unescape:
                unescaped_code = ScenarioManager.unescape_code(code_raw).rstrip()
            else:
                unescaped_code = code_raw.rstrip()
            scenarios.append({
                "scenario_title": s.get("title", f"Scenario {idx+1}"),
                "scenario_description": s.get("description", ""),
                "scenario_category": s.get("category", "Happy Path"),
                "scenario_code": unescaped_code,
                "original_scenario_code": unescaped_code,
                "sort_order": s.get("sort_order", idx),
            })

        return metadata, scenarios

    # ----------------------------------------------------------------------
    # 2. Extract test blocks reliably from fullCode (fallback mode)
    # ----------------------------------------------------------------------
    @staticmethod
    def extract_test_blocks(full_code: str, language: str) -> List[str]:
        """
        Extract all test blocks if LLM didn't provide structured test scenarios.

        This version:
            - Handles multiline defs
            - Handles decorators
            - Handles async tests
            - Handles class-based tests
            - Stops block at next def/test/function of same indent
        """
        lines = full_code.split("\n")

        test_blocks = []
        current_block = []
        capturing = False
        base_indent = None

        for i, line in enumerate(lines):
            stripped = line.strip()

            # Identify start of a test
            if ScenarioManager._is_test_start_line(stripped, language):
                # Save previous block
                if current_block:
                    test_blocks.append("\n".join(current_block).rstrip())
                    current_block = []

                capturing = True
                base_indent = ScenarioManager._indent_level(line)
                current_block.append(line)
                continue

            # Continue capturing until indentation level closes the block
            if capturing:
                indent = ScenarioManager._indent_level(line)

                # If indentation returns to base level → new block begins
                if stripped and indent <= base_indent and not stripped.startswith("@"):
                    # Finish current block
                    test_blocks.append("\n".join(current_block).rstrip())
                    current_block = []
                    capturing = False

                if capturing:
                    current_block.append(line)

        # Add last block
        if current_block:
            test_blocks.append("\n".join(current_block).rstrip())

        return test_blocks

    # ----------------------------------------------------------------------
    # Helpers for extraction
    # ----------------------------------------------------------------------
    @staticmethod
    def _is_test_start_line(line: str, language: str) -> bool:
        """More robust detection of test function/class starts."""
        if language.lower() == "python":
            return (
                re.match(r"@pytest", line)
                or re.match(r"def\s+test_", line)
                or re.match(r"async\s+def\s+test_", line)
                or re.match(r"class\s+Test", line)
            )

        if language.lower() in ["javascript", "typescript"]:
            return (
                re.match(r"(test|it)\(", line)
                or "describe(" in line
            )

        if language.lower() == "java":
            return "@Test" in line

        return False

    @staticmethod
    def _indent_level(line: str) -> int:
        return len(line) - len(line.lstrip(" "))

    # ----------------------------------------------------------------------
    # 3. Rebuild final test suite text
    # ----------------------------------------------------------------------
    @staticmethod
    def rebuild_full_code(
        imports: str,
        setup_code: str,
        scenarios: List[Dict],
        teardown_code: Optional[str] = None,
        language: str = "python",
    ) -> str:
        """
        Assemble the final test file from structured components.
        """

        parts = []

        # 1. Imports
        if imports:
            parts.append(imports.strip())
            parts.append("")

        # 2. Setup
        if setup_code:
            parts.append(setup_code.strip())
            parts.append("")

        # 3. Scenario blocks in correct order
        scenarios_sorted = sorted(scenarios, key=lambda s: s.get("sort_order", 0))

        for s in scenarios_sorted:
            code = s.get("scenario_code", "").strip()
            if code:
                parts.append(code)
                parts.append("")

        # 4. Teardown
        if teardown_code:
            parts.append(teardown_code.strip())

        # Cleanup: collapse 3+ blank lines into 2
        full_code = "\n".join(parts)
        full_code = re.sub(r"\n{3,}", "\n\n", full_code).strip()

        return full_code


# ----------------------------------------------------------------------
# Utility: Extract function name safely
# ----------------------------------------------------------------------
def extract_function_name_from_code(code: str) -> str:
    """
    Extract the test function name from a block of test code.
    Handles async, decorators, JS tests, and multiple languages.
    """

    python_patterns = [
        r"def\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(",  # Any function name
        r"async\s+def\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(",
    ]

    for pattern in python_patterns:
        m = re.search(pattern, code)
        if m:
            return m.group(1)

    js_patterns = [
        r"test\(['\"](.+?)['\"]",
        r"it\(['\"](.+?)['\"]",
    ]

    for pattern in js_patterns:
        m = re.search(pattern, code)
        if m:
            return m.group(1)

    java_patterns = [
        r"@Test\s+public\s+void\s+([A-Za-z0-9_]+)\s*\(",
    ]

    for pattern in java_patterns:
        m = re.search(pattern, code)
        if m:
            return m.group(1)

    return "unknown_test"
