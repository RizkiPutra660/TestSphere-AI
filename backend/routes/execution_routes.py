"""
Test Execution Routes for UI and Integration Tests

Handles:
- UI test execution via Playwright
- Integration/API test execution
- Test result normalization and storage
"""

from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
import subprocess
import os
import uuid
import json
import urllib.request as _urllib_request
import re as _re
from html.parser import HTMLParser as _HTMLParser
import data.database as database
import data.test_execution as test_execution
import logging

logger = logging.getLogger(__name__)

# Create two separate blueprints for different URL prefixes
ui_bp = Blueprint("ui_bp", __name__, url_prefix="/api/ui")
integration_bp = Blueprint("integration_bp", __name__, url_prefix="/api/integration")


# ============================================================================
# SHARED UTILITIES
# ============================================================================

def normalize_playwright_report(payload: dict) -> dict:
    """
    Convert Playwright JSON report to standardized format.
    
    Input: { ok: boolean, report: {...}, runnerError?: string }
    Output: {
        ok,
        summary: { total, passed, failed, durationMs },
        tests: [ { title, status, durationMs, error } ],
        runnerError?
    }
    """
    ok = bool(payload.get("ok"))
    report = payload.get("report") or {}
    runner_error = payload.get("runnerError")

    tests_out = []
    total = passed = failed = 0
    duration_ms = report.get("stats", {}).get("duration", 0) or 0

    def walk_suites(suites):
        nonlocal total, passed, failed, tests_out
        for suite in suites or []:
            walk_suites(suite.get("suites", []))

            for spec in suite.get("specs", []):
                title_path = spec.get("titlePath") or []
                spec_title = " / ".join(title_path) if title_path else spec.get("title", "Test")

                for t in spec.get("tests", []):
                    results = t.get("results", [])
                    last = results[-1] if results else {}
                    status = last.get("status", "unknown")
                    dur = last.get("duration", 0) or 0

                    err_obj = last.get("error") or {}
                    err_msg = err_obj.get("message")

                    total += 1
                    if status == "passed":
                        passed += 1
                    else:
                        failed += 1

                    tests_out.append({
                        "title": spec_title,
                        "status": status,
                        "durationMs": dur,
                        "error": err_msg
                    })

    walk_suites(report.get("suites", []))

    return {
        "ok": ok,
        "summary": {
            "total": total,
            "passed": passed,
            "failed": failed,
            "durationMs": duration_ms
        },
        "tests": tests_out,
        "runnerError": runner_error
    }


def save_test_execution_to_db(project_id, user_id, base_url, test_type, result, function_name="Test Execution"):
    """
    Save test execution results to database.
    
    Args:
        project_id: Project ID (or None to use default)
        user_id: Current user ID
        base_url: Base URL tested
        test_type: Either 'ui-test' or 'integration-test'
        result: Normalized test result dict
        function_name: Human-readable test name
    
    Returns:
        Tuple of (ai_request_id, execution_log_id) or (None, None) on error
    """
    try:
        if not project_id:
            project_id = test_execution.get_or_create_default_project(user_id=user_id)
        
        conn = database.get_db_connection()
        cur = conn.cursor()
        
        # 1. Create ai_request entry
        cur.execute('''
            INSERT INTO ai_requests (project_id, request_text, model_used, status, function_name)
            VALUES (%s, %s, %s, %s, %s) RETURNING id
        ''', (
            project_id,
            f"{test_type.replace('-', ' ').title()}: {base_url}",
            test_type,
            'completed',
            function_name
        ))
        ai_request_id = cur.fetchone()[0]
        
        # 2. Create generated_tests entry (for history compatibility)
        test_code_json = {
            "language": "javascript",
            "fullCode": f"// {test_type.replace('-', ' ').title()} for {base_url}",
            "testCases": []
        }
        cur.execute('''
            INSERT INTO generated_tests (ai_request_id, test_code)
            VALUES (%s, %s)
        ''', (ai_request_id, json.dumps(test_code_json)))
        
        conn.commit()
        
        # 3. Create execution log
        total_tests = result.get("summary", {}).get("total", 0)
        test_mode = 'integration' if test_type == 'integration-test' else 'ui'
        execution_log_id = test_execution.create_execution_log(ai_request_id, total_tests, test_mode)
        
        # 4. Save individual test results
        tests = result.get("tests", [])
        passed_count = 0
        failed_count = 0
        
        for test in tests:
            status = test.get("status", "unknown")
            if status == "passed":
                passed_count += 1
            else:
                failed_count += 1
            
            test_execution.save_test_case_result(
                execution_log_id=execution_log_id,
                test_case_name=test.get("title", "Unknown Test"),
                test_case_category="UI Test" if test_type == 'ui-test' else "Integration Test",
                test_case_description=test.get("title", ""),
                status=status,
                execution_time_ms=test.get("durationMs", 0),
                error_message=test.get("error"),
                stack_trace=None
            )
        
        # 5. Update execution log summary
        total_duration = result.get("summary", {}).get("durationMs", 0)
        overall_status = "passed" if failed_count == 0 else "failed"
        
        test_execution.update_execution_log_summary(
            execution_log_id,
            passed_count,
            failed_count,
            total_duration,
            overall_status,
            f"{passed_count}/{total_tests} tests passed"
        )
        
        cur.close()
        database.return_db_connection(conn)
        
        logger.info(f"Saved {test_type} results: ai_request_id={ai_request_id}, execution_log_id={execution_log_id}")
        return ai_request_id, execution_log_id
    
    except Exception as e:
        logger.exception(f"Failed to save test execution to database: {e}")
        return None, None


# ============================================================================
# AI STEP GENERATION — DOM scraper + LLM
# ============================================================================

class _InteractiveElementParser(_HTMLParser):
    """Extract interactive elements and their selectors from raw HTML."""

    def __init__(self):
        super().__init__()
        self.elements: list[dict] = []
        self._tag_stack: list[str] = []
        self._text_buf: list[str] = []
        self._capture_text_for: str | None = None

    def handle_starttag(self, tag, attrs):
        attrs_dict = dict(attrs)
        self._tag_stack.append(tag)

        def _best_selector():
            if attrs_dict.get("data-testid"):
                return f'[data-testid="{attrs_dict["data-testid"]}"]'
            if attrs_dict.get("id"):
                return f'#{attrs_dict["id"]}'
            if attrs_dict.get("name"):
                return f'[name="{attrs_dict["name"]}"]'
            if tag == "button" and attrs_dict.get("type"):
                return f'button[type="{attrs_dict["type"]}"]'
            return None

        selector = _best_selector()

        if tag == "input":
            itype = attrs_dict.get("type", "text")
            if itype in ("hidden", "submit", "reset"):
                return
            info = {"tag": "input", "type": itype, "selector": selector}
            if attrs_dict.get("placeholder"):
                info["placeholder"] = attrs_dict["placeholder"]
            if attrs_dict.get("aria-label"):
                info["aria_label"] = attrs_dict["aria-label"]
            self.elements.append(info)

        elif tag in ("button", "a"):
            self._capture_text_for = tag
            self._text_buf = []
            info = {"tag": tag, "selector": selector}
            if tag == "a" and attrs_dict.get("href"):
                info["href"] = attrs_dict["href"]
            self.elements.append(info)

        elif tag == "select":
            info = {"tag": "select", "selector": selector}
            self.elements.append(info)

        elif tag == "textarea":
            info = {"tag": "textarea", "selector": selector}
            if attrs_dict.get("placeholder"):
                info["placeholder"] = attrs_dict["placeholder"]
            self.elements.append(info)

        elif tag == "form":
            info = {"tag": "form"}
            if attrs_dict.get("action"):
                info["action"] = attrs_dict["action"]
            self.elements.append(info)

    def handle_data(self, data):
        if self._capture_text_for:
            self._text_buf.append(data.strip())

    def handle_endtag(self, tag):
        if tag == self._capture_text_for and self.elements:
            text = " ".join(t for t in self._text_buf if t)
            if text:
                self.elements[-1]["text"] = text[:80]
            self._capture_text_for = None
            self._text_buf = []
        if self._tag_stack and self._tag_stack[-1] == tag:
            self._tag_stack.pop()

    def error(self, message):
        pass  # silently ignore HTML parse errors


def _extract_dom_context(html: str, max_chars: int = 3000) -> str:
    """Return a compact text summary of interactive elements."""
    parser = _InteractiveElementParser()
    try:
        parser.feed(html)
    except Exception:
        pass

    lines = []
    for el in parser.elements:
        tag = el.get("tag", "")
        sel = el.get("selector") or "(no selector)"
        if tag == "input":
            line = f'input[type={el.get("type","text")}] selector={sel}'
            if el.get("placeholder"):
                line += f' placeholder="{el["placeholder"]}"'
            if el.get("aria_label"):
                line += f' aria-label="{el["aria_label"]}"'
        elif tag == "button":
            line = f'button selector={sel}'
            if el.get("text"):
                line += f' text="{el["text"]}"'
        elif tag == "a":
            line = f'link selector={sel}'
            if el.get("text"):
                line += f' text="{el["text"]}"'
            if el.get("href"):
                line += f' href="{el["href"]}"'
        elif tag == "select":
            line = f'select selector={sel}'
        elif tag == "textarea":
            line = f'textarea selector={sel}'
            if el.get("placeholder"):
                line += f' placeholder="{el["placeholder"]}"'
        elif tag == "form":
            line = f'form action="{el.get("action","")}"'
        else:
            continue
        lines.append(line)

    result = "\n".join(lines)
    return result[:max_chars] if len(result) > max_chars else result


def _fetch_page_dom(url: str, timeout: int = 8) -> str:
    """Fetch page HTML. Returns empty string on failure."""
    try:
        req = _urllib_request.Request(
            url,
            headers={
                "User-Agent": (
                    "Mozilla/5.0 (compatible; GenAI-QA/1.0; DOM-Inspector)"
                )
            },
        )
        with _urllib_request.urlopen(req, timeout=timeout) as resp:
            return resp.read().decode("utf-8", errors="replace")
    except Exception as e:
        logger.warning(f"[generate-steps] Could not fetch {url}: {e}")
        return ""


_UI_STEPS_PROMPT = """You are a Playwright E2E test step generator.

# Available Step Types
- goto        → fields: path (e.g. "/login")
- click       → fields: selector
- fill        → fields: selector, value
- press       → fields: selector, key (e.g. "Enter")
- waitFor     → fields: selector OR ms (number, milliseconds)
- expectVisible      → fields: selector
- expectHidden       → fields: selector
- expectTextContains → fields: selector, value
- expectUrlContains  → fields: value (substring of URL)
- expectTitleContains → fields: value (substring of page title)

# Selector Priority
1. [data-testid="..."]  ← always prefer this
2. #id
3. [name="..."]  ← for inputs
4. text=Button Text  ← for buttons/links without attributes
5. CSS fallback: input[type=email], button[type=submit], etc.

# Interactive Elements Found on Page ({url})
{dom_context}

# User Scenario
{scenario}

# Task
Generate one or more named test scenarios that cover the described journey.
Prefer data-testid selectors where available from the element list.
If an element is not in the list, make a reasonable selector guess.
Add expectUrlContains or expectVisible assertions at important milestones.

Return ONLY valid JSON — no markdown, no comments.
{{
  "scenarios": [
    {{
      "name": "Short descriptive name",
      "startPath": "/path",
      "steps": [
        {{"type": "fill", "selector": "[data-testid=email]", "value": "test@example.com"}},
        {{"type": "click", "selector": "[data-testid=submit-btn]"}},
        {{"type": "expectUrlContains", "value": "/dashboard"}}
      ]
    }}
  ]
}}

Rules:
- Only include fields relevant to the step type (no null/undefined fields)
- Break complex journeys into multiple named scenarios
- Always start each scenario with a goto step unless the startPath is enough
"""


@ui_bp.route("/generate-steps", methods=["POST"])
@jwt_required()
def generate_ui_steps():
    """
    AI-powered step generator: fetches live page DOM + calls LLM.

    Body:
      { "baseUrl": "http://...", "startPath": "/login", "scenario": "User logs in..." }
    Returns:
      { "scenarios": [ { "name", "startPath", "steps": [...] } ] }
    """
    from utils.llm_service import LLMService

    data = request.get_json() or {}
    base_url = (data.get("baseUrl") or "").rstrip("/")
    start_path = data.get("startPath") or "/"
    scenario = (data.get("scenario") or "").strip()

    if not base_url:
        return jsonify({"error": "baseUrl is required"}), 400
    if not scenario:
        return jsonify({"error": "scenario description is required"}), 400

    # Step 1: Fetch & parse the page
    page_url = base_url + start_path
    html = _fetch_page_dom(page_url)
    if html:
        dom_context = _extract_dom_context(html)
        if not dom_context.strip():
            dom_context = "(Page fetched but no interactive elements detected)"
    else:
        dom_context = "(Page could not be reached — generating steps from scenario description only)"

    # Step 2: Build prompt and call LLM
    prompt = _UI_STEPS_PROMPT.format(
        url=page_url,
        dom_context=dom_context,
        scenario=scenario,
    )

    try:
        llm = LLMService()
        result = llm.generate_content(
            prompt=prompt,
            max_tokens=4096,
            temperature=0.2,
            response_format="json",
        )
        raw = (result.get("text") or "").strip()

        # Strip markdown fences if present
        import re
        json_match = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", raw, re.DOTALL)
        if json_match:
            raw = json_match.group(1)
        else:
            start = raw.find("{")
            end = raw.rfind("}")
            if start != -1 and end != -1:
                raw = raw[start : end + 1]

        parsed = json.loads(raw)
        return jsonify(parsed)

    except json.JSONDecodeError as e:
        logger.error(f"[generate-steps] JSON parse error: {e} — raw: {raw[:300]}")
        return jsonify({"error": "AI returned invalid JSON"}), 500
    except Exception as e:
        logger.error(f"[generate-steps] LLM error: {e}")
        return jsonify({"error": str(e)}), 500


# ============================================================================
# UI TEST EXECUTION
# ============================================================================

@ui_bp.route("/run", methods=["POST"])
@jwt_required()
def run_ui_tests():
    """
    Execute UI tests via Playwright.
    
    Body example:
    {
      "baseUrl": "http://localhost:5173",
      "uiSpec": [
        {
          "name": "Smoke",
          "startPath": "/",
          "steps": [{ "type": "expectVisible", "selector": "body" }]
        }
      ],
      "project_id": 123,
      "function_name": "UI Test: local"
    }
    """
    body = request.get_json(force=True) or {}

    project_id = body.get("project_id")
    function_name = body.get("function_name", "UI Test")
    user_id = int(get_jwt_identity())

    base_url = body.get("baseUrl")
    if not base_url:
        return jsonify({"error": "baseUrl is required"}), 400

    ui_spec = body.get("uiSpec")
    if ui_spec is None:
        return jsonify({"error": "uiSpec is required"}), 400
    if not isinstance(ui_spec, list) or len(ui_spec) == 0:
        return jsonify({"error": "uiSpec must be a non-empty array"}), 400

    session_id = str(uuid.uuid4())

    backend_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    runner_dir = os.path.join(backend_root, "playwright_runner")

    if not os.path.isdir(runner_dir):
        return jsonify({"error": f"playwright_runner folder not found at {runner_dir}"}), 500

    ui_spec_json = json.dumps(ui_spec)

    cmd = [
        "node",
        "run.mjs",
        "--mode", "ui",
        "--session", session_id,
        "--baseUrl", base_url,
        "--uiSpec", ui_spec_json
    ]

    try:
        proc = subprocess.run(
            cmd,
            cwd=runner_dir,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=240
        )
    except subprocess.TimeoutExpired:
        return jsonify({"error": "UI test run timed out"}), 408

    stdout = (proc.stdout or "").strip()
    stderr = (proc.stderr or "").strip()

    payload = None
    for line in stdout.splitlines()[::-1]:
        try:
            payload = json.loads(line)
            break
        except Exception:
            continue

    if payload is None:
        return jsonify({
            "error": "Runner did not return JSON",
            "stdout_tail": stdout[-2000:],
            "stderr_tail": stderr[-2000:]
        }), 500

    result = normalize_playwright_report(payload)

    # Save to database
    ai_request_id, execution_log_id = save_test_execution_to_db(
        project_id=project_id,
        user_id=user_id,
        base_url=base_url,
        test_type='ui-test',
        result=result,
        function_name=function_name
    )
    
    if ai_request_id:
        result["ai_request_id"] = ai_request_id
        result["execution_log_id"] = execution_log_id

    if result.get("ok") is False and result.get("summary", {}).get("total", 0) == 0:
        return jsonify(result), 500

    return jsonify(result), 200


# ============================================================================
# INTEGRATION TEST EXECUTION
# ============================================================================

@integration_bp.route("/run", methods=["POST"])
@jwt_required()
def run_integration_tests():
    """
    Execute integration/API tests via Playwright.
    
    NEW Body example (recommended):
    {
      "baseUrl": "http://localhost:5000",
      "requests": [
        { "method": "GET", "path": "/chat/health" },
        { "method": "POST", "path": "/api/generate-tests", "body": { ... } },
        { "method": "DELETE", "path": "/api/admin/terms-conditions/123" }
      ],
      "headers": {
        "Authorization": "Bearer <token>",
        "Content-Type": "application/json"
      },
      "project_id": 123,
      "function_name": "API Integration Test"
    }
    
    BACKWARD COMPATIBLE (old):
    {
      "baseUrl": "http://localhost:5000",
      "endpoints": ["/", "/api/projects"]
    }
    """
    body = request.get_json(force=True) or {}

    project_id = body.get("project_id")
    function_name = body.get("function_name", "Integration Test")
    user_id = int(get_jwt_identity())

    base_url = body.get("baseUrl")
    if not base_url:
        return jsonify({"error": "baseUrl is required"}), 400

    # NEW: requests[] (method + path + optional body)
    requests_list = body.get("requests", None)
    
    # OLD: endpoints[] (GET only)
    endpoints = body.get("endpoints", None)

    # Optional global headers
    headers = body.get("headers", {}) or {}

    if requests_list is None and endpoints is None:
        return jsonify({"error": "Provide either 'requests' (new) or 'endpoints' (old)"}), 400

    # Normalize requests
    normalized_requests = []

    if requests_list is not None:
        if not isinstance(requests_list, list) or len(requests_list) == 0:
            return jsonify({"error": "requests must be a non-empty array"}), 400

        for r in requests_list:
            if not isinstance(r, dict):
                return jsonify({"error": "Each request item must be an object"}), 400

            method = str(r.get("method", "GET")).upper().strip()
            path = str(r.get("path", "")).strip()

            if method not in ["GET", "POST", "PUT", "PATCH", "DELETE"]:
                return jsonify({"error": f"Invalid method: {method}"}), 400

            if not path:
                return jsonify({"error": "Each request must have 'path'"}), 400

            if not path.startswith("/"):
                path = "/" + path

            normalized_requests.append({
                "method": method,
                "path": path,
                "body": r.get("body", None)
            })
    else:
        # Backward compatibility: endpoints[] -> requests[] (GET only)
        if not isinstance(endpoints, list) or len(endpoints) == 0:
            return jsonify({"error": "endpoints must be a non-empty array"}), 400

        for ep in endpoints:
            ep_str = str(ep).strip()
            if not ep_str:
                continue
            if not ep_str.startswith("/"):
                ep_str = "/" + ep_str
            normalized_requests.append({"method": "GET", "path": ep_str, "body": None})

        if len(normalized_requests) == 0:
            return jsonify({"error": "No valid endpoints provided"}), 400

    if headers is not None and not isinstance(headers, dict):
        return jsonify({"error": "headers must be an object (key/value)"}), 400

    session_id = str(uuid.uuid4())

    backend_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    runner_dir = os.path.join(backend_root, "playwright_runner")

    if not os.path.isdir(runner_dir):
        return jsonify({"error": f"playwright_runner folder not found at {runner_dir}"}), 500

    requests_json = json.dumps(normalized_requests)
    headers_json = json.dumps(headers or {})

    cmd = [
        "node",
        "run.mjs",
        "--session", session_id,
        "--baseUrl", base_url,
        "--requests", requests_json,
        "--headers", headers_json
    ]

    try:
        proc = subprocess.run(
            cmd,
            cwd=runner_dir,
            capture_output=True,
            text=True,
            timeout=180
        )
    except subprocess.TimeoutExpired:
        return jsonify({"error": "Integration test run timed out"}), 408

    stdout = (proc.stdout or "").strip()
    stderr = (proc.stderr or "").strip()

    payload = None
    for line in stdout.splitlines()[::-1]:
        try:
            payload = json.loads(line)
            break
        except Exception:
            continue

    if payload is None:
        return jsonify({
            "error": "Runner did not return JSON",
            "stdout_tail": stdout[-2000:],
            "stderr_tail": stderr[-2000:]
        }), 500

    result = normalize_playwright_report(payload)

    # Save to database
    ai_request_id, execution_log_id = save_test_execution_to_db(
        project_id=project_id,
        user_id=user_id,
        base_url=base_url,
        test_type='integration-test',
        result=result,
        function_name=function_name
    )
    
    if ai_request_id:
        result["ai_request_id"] = ai_request_id
        result["execution_log_id"] = execution_log_id

    if result.get("ok") is False and result.get("summary", {}).get("total", 0) == 0:
        return jsonify(result), 500

    return jsonify(result), 200
