from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required
import requests
import data.database as database
from utils.llm_service import llm_service
from utils.scenario_manager import ScenarioManager, extract_function_name_from_code
from utils.config_validator import ConfigValidator
from utils.docker_executor import execute_tests_in_docker, ExecutionMode
from utils.file_utils import filter_testable_files, all_testable_files_tested
from utils.api_response import error_response, success_response
from utils.logger import setup_logger
from utils.validation import ManualQueueRequest
from pydantic import ValidationError
import json
from datetime import datetime
from data.test_queue import (
    list_test_queue_items,
    get_test_queue_item,
    update_test_queue_status,
    add_test_queue_item,
)
import hmac
import hashlib
import os

logger = setup_logger(__name__)

queue_bp = Blueprint('queue', __name__, url_prefix='/api')

# ==================== WEBHOOK HELPERS ====================

def verify_github_webhook_signature(payload_bytes: bytes, signature: str, secret: str) -> bool:
    """Verify GitHub webhook signature using HMAC-SHA256.
    
    Args:
        payload_bytes: Raw request body bytes
        signature: X-Hub-Signature-256 header value (format: sha256=<hex>)
        secret: GitHub webhook secret
    
    Returns:
        True if signature is valid, False otherwise
    """
    if not secret or not signature:
        return False
    
    expected_signature = hmac.new(
        secret.encode(),
        payload_bytes,
        hashlib.sha256
    ).hexdigest()
    
    # signature format: sha256=<hex>
    if not signature.startswith('sha256='):
        return False
    
    provided_signature = signature[7:]  # Strip "sha256=" prefix
    
    # Use constant-time comparison to prevent timing attacks
    return hmac.compare_digest(expected_signature, provided_signature)


def should_trigger_tests(payload: dict, branch_filter: str = None) -> bool:
    """Determine if webhook should trigger test queue items.
    
    Args:
        payload: GitHub webhook payload
        branch_filter: Optional branch name to filter on (e.g., 'main')
    
    Returns:
        True if tests should be triggered
    """
    # Skip deleted branches
    if payload.get('deleted'):
        return False
    
    # Check branch filter
    ref = payload.get('ref', '')
    branch = ref.split('/')[-1] if ref else ''
    
    if branch_filter and branch != branch_filter:
        logger.info(f"Branch {branch} does not match filter {branch_filter}, skipping")
        return False
    
    # Ensure there are commits
    commits = payload.get('commits', [])
    if not commits:
        logger.info("No commits in webhook, skipping")
        return False
    
    return True


# ==================== QUEUE ROUTES ====================

@queue_bp.route('/test-items', methods=['GET'])
@jwt_required()
def list_items():
    """List test queue items, defaulting to pending status.
    Query params: status, project_id, page, per_page
    """
    status = request.args.get('status', 'pending')
    project_id = request.args.get('project_id', type=int)
    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 50, type=int)
    offset = (page - 1) * per_page

    items = list_test_queue_items(status=status, project_id=project_id, limit=per_page, offset=offset)
    
    # Convert datetime objects to ISO format strings
    for item in items:
        if 'created_at' in item and hasattr(item['created_at'], 'isoformat'):
            item['created_at'] = item['created_at'].isoformat()
    
    return jsonify({
        'items': items,
        'pagination': {
            'page': page,
            'perPage': per_page,
            'count': len(items)
        }
    })

@queue_bp.route('/test-items/<int:item_id>', methods=['GET'])
@jwt_required()
def get_item(item_id: int):
    item = get_test_queue_item(item_id)
    if not item:
        return error_response('Item not found', 404)
    return jsonify(item)

@queue_bp.route('/test-items/<int:item_id>/status', methods=['PATCH'])
@jwt_required()
def update_item_status(item_id: int):
    """Update the status of a queue item.
    Body: { "status": "pending" | "running" | "done" | "failed", "execution_log_id": int (optional), "tested_file": str (optional) }
    """
    data = request.get_json() or {}
    status = (data.get('status') or '').lower()
    execution_log_id = data.get('execution_log_id')
    tested_file = data.get('tested_file')  # Track which file was just tested
    
    if status not in ('pending', 'running', 'done', 'failed'):
        return jsonify({'error': 'Invalid status. Use "pending", "running", "done", or "failed"'}), 400

    # Ensure item exists
    item = get_test_queue_item(item_id)
    if not item:
        return jsonify({'error': 'Item not found'}), 404

    # Update status
    try:
        if status == 'done':
            # Mark as done with completion timestamp and execution_log_id
            database.execute_query(
                """
                UPDATE test_queue_items
                SET status = %(status)s, 
                    completed_at = CURRENT_TIMESTAMP,
                    execution_logs_link = %(execution_log_id)s
                WHERE id = %(id)s
                """,
                params={"id": item_id, "status": status, "execution_log_id": str(execution_log_id) if execution_log_id else None},
                fetch=False,
            )
        elif status == 'running':
            # Update to running and add tested file to the list
            current_tested = item.get('tested_files', '[]')
            try:
                tested_files = json.loads(current_tested) if isinstance(current_tested, str) else []
            except:
                tested_files = []
            
            # Build execution_logs_map: file -> execution_log_id
            current_logs_map = item.get('execution_logs_map', '{}')
            try:
                logs_map = json.loads(current_logs_map) if isinstance(current_logs_map, str) else {}
            except:
                logs_map = {}
            
            # Add newly tested file if provided
            if tested_file and tested_file not in tested_files:
                tested_files.append(tested_file)
                # Store the execution_log_id for this file
                if execution_log_id:
                    logs_map[tested_file] = execution_log_id
            
            # Check if all testable files have been tested - auto-transition to done
            file_list = item.get('file_list', '[]')
            try:
                file_list = json.loads(file_list) if isinstance(file_list, str) else file_list
            except:
                file_list = []
            
            testable_files = filter_testable_files(file_list)
            final_status = status
            
            # If all testable files have been tested, mark as done
            if all_testable_files_tested(file_list, tested_files):
                final_status = 'done'
                logger.info(f"All testable files tested for item {item_id}. Auto-transitioning to done.")
            
            if final_status == 'done':
                # Update to done with completion timestamp and execution logs map
                database.execute_query(
                    """
                    UPDATE test_queue_items
                    SET status = %(status)s,
                        tested_files = %(tested_files)s,
                        execution_logs_map = %(execution_logs_map)s,
                        completed_at = CURRENT_TIMESTAMP,
                        execution_logs_link = %(execution_log_id)s
                    WHERE id = %(id)s
                    """,
                    params={"id": item_id, "status": final_status, "tested_files": json.dumps(tested_files), "execution_logs_map": json.dumps(logs_map), "execution_log_id": str(execution_log_id) if execution_log_id else None},
                    fetch=False,
                )
            else:
                database.execute_query(
                    """
                    UPDATE test_queue_items
                    SET status = %(status)s,
                        tested_files = %(tested_files)s,
                        execution_logs_map = %(execution_logs_map)s
                    WHERE id = %(id)s
                    """,
                    params={"id": item_id, "status": final_status, "tested_files": json.dumps(tested_files), "execution_logs_map": json.dumps(logs_map)},
                    fetch=False,
                )
        else:
            # Update status without timestamp
            database.execute_query(
                """
                UPDATE test_queue_items
                SET status = %(status)s
                WHERE id = %(id)s
                """,
                params={"id": item_id, "status": status},
                fetch=False,
            )
        
        return jsonify({'message': f'Item status updated to {status}', 'item_id': item_id, 'status': status}), 200
    except Exception as e:
        return jsonify({'error': f'Failed to update item status: {str(e)}'}), 500

@queue_bp.route('/test-items/<int:item_id>', methods=['DELETE'])
@jwt_required()
def delete_item(item_id: int):
    """Delete a queue item."""
    # Ensure item exists
    item = get_test_queue_item(item_id)
    if not item:
        return error_response('Item not found', 404)

    try:
        database.execute_query(
            "DELETE FROM test_queue_items WHERE id = %(id)s",
            params={"id": item_id},
            fetch=False,
        )
        return success_response(message='Item deleted successfully', data={'item_id': item_id})
    except Exception as e:
        logger.exception(f"Failed to delete item: {str(e)}")
        return error_response(f'Failed to delete item: {str(e)}', 500)

@queue_bp.route('/test-items/<int:item_id>/run', methods=['POST'])
@jwt_required()
def run_item(item_id: int):
    """Trigger a manual run for the selected item.
    Body: { "testType": "unit" | "integration" }
    For now, this marks the item as running and sets the chosen test type.
    Actual execution will be wired in the next steps.
    """
    data = request.get_json() or {}
    test_type = (data.get('testType') or '').lower()
    if test_type not in ('unit', 'integration'):
        return jsonify({'error': 'Invalid testType. Use "unit" or "integration"'}), 400

    # Ensure item exists
    item = get_test_queue_item(item_id)
    if not item:
        return jsonify({'error': 'Item not found'}), 404

    # Update status to running and set test_type
    try:
        database.execute_query(
            """
            UPDATE test_queue_items
            SET status = 'running', test_type = %(test_type)s, started_at = CURRENT_TIMESTAMP
            WHERE id = %(id)s
            """,
            params={"id": item_id, "test_type": test_type},
            fetch=False,
        )
    except Exception as e:
        return jsonify({'error': f'Failed to update item: {str(e)}'}), 500

    # Helper: infer language from file extension
    def infer_language_from_path(path: str) -> str:
        if path.endswith('.py'):
            return 'python'
        if path.endswith('.ts'):
            return 'typescript'
        if path.endswith('.js'):
            return 'javascript'
        if path.endswith('.java'):
            return 'java'
        return 'python'

    # Helper: fetch file content from GitHub using raw URL
    def fetch_github_file(repo_url: str, commit_hash: str, file_path: str) -> str:
        # repo_url like https://github.com/owner/repo
        try:
            parts = repo_url.rstrip('/').split('/')
            owner = parts[-2]
            repo = parts[-1]
            raw_url = f"https://raw.githubusercontent.com/{owner}/{repo}/{commit_hash}/{file_path}"
            resp = requests.get(raw_url, timeout=20)
            if resp.status_code == 200:
                return resp.text
            raise RuntimeError(f"Failed to fetch file: {resp.status_code}")
        except Exception as e:
            raise RuntimeError(str(e))

    # Choose a file to test (first in list)
    files = item.get('file_list') or []
    if not files:
        update_test_queue_status(item_id, 'failed', error_message='No files in queue item')
        return jsonify({'error': 'No files available to test'}), 400
    target_file = files[0]

    # Fetch source code (GitHub only for now)
    source_code = None
    try:
        if 'github.com' in (item.get('repo_url') or ''):
            source_code = fetch_github_file(item['repo_url'], item['commit_hash'], target_file)
        else:
            raise RuntimeError('Unsupported repo_url for code fetch. Only GitHub is supported at this step.')
    except Exception as e:
        update_test_queue_status(item_id, 'failed', error_message=f'Fetch error: {str(e)}')
        return jsonify({'error': f'Failed to fetch source code: {str(e)}'}), 500

    language = infer_language_from_path(target_file)

    # Build config minimal
    test_config = ConfigValidator.validate_config({
        'framework': 'pytest' if language == 'python' else 'jest' if language in ['javascript', 'typescript'] else 'junit'
    }, language)

    # Prepare prompt for generation
    try:
        prompt = (
            "Generate unit tests in JSON for the following code. Return a JSON object "
            "with keys language, summary, imports, setup_code, teardown_code, and testCases.\n\n"
            f"Language: {language}\n\n"
            f"Code:\n{source_code}\n"
        )

        response = llm_service.generate_content(
            prompt=prompt,
            max_tokens=8000,
            temperature=0.2
        )
        raw_text = response['text']
        if not raw_text:
            raise RuntimeError('LLM returned no content')

        # Extract JSON
        cleaned = raw_text.strip()
        try:
            data_json = json.loads(cleaned)
        except Exception:
            # Try to extract code block
            import re
            m = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", cleaned, re.DOTALL)
            if not m:
                raise
            data_json = json.loads(m.group(1))

        metadata, scenarios = ScenarioManager.parse_llm_response(data_json)
        full_code = ScenarioManager.rebuild_full_code(
            imports=metadata['imports'],
            setup_code=metadata['setup_code'],
            scenarios=scenarios,
            teardown_code=metadata['teardown_code'],
            language=metadata['language']
        )
    except Exception as e:
        update_test_queue_status(item_id, 'failed', error_message=f'Generation error: {str(e)}')
        return jsonify({'error': f'Failed to generate tests: {str(e)}'}), 500

    # Save ai_request + generated_tests (for history)
    ai_request_id = None
    try:
        conn = database.get_db_connection()
        cur = conn.cursor()
        function_name = extract_function_name_from_code(source_code)
        cur.execute(
            '''INSERT INTO ai_requests (project_id, request_text, model_used, status, function_name)
               VALUES (%s, %s, %s, %s, %s) RETURNING id''',
            (item['project_id'], source_code[:1000], 'gemini-2.5-flash', 'completed', function_name)
        )
        ai_request_id = cur.fetchone()[0]
        legacy_response = {
            'language': metadata['language'],
            'summary': metadata['summary'],
            'testCases': [
                {
                    'id': idx + 1,
                    'title': s['scenario_title'],
                    'description': s['scenario_description'],
                    'category': s['scenario_category'],
                    'code': s['scenario_code']
                } for idx, s in enumerate(scenarios)
            ],
            'fullCode': full_code
        }
        cur.execute('INSERT INTO generated_tests (ai_request_id, test_code) VALUES (%s, %s)', (ai_request_id, json.dumps(legacy_response)))
        conn.commit()
        cur.close(); database.return_db_connection(conn)
    except Exception as e:
        update_test_queue_status(item_id, 'failed', error_message=f'DB save error: {str(e)}')
        return jsonify({'error': f'Failed to save generated tests: {str(e)}'}), 500

    # Execute tests in Docker
    try:
        mode = ExecutionMode.UNIT if test_type == 'unit' else ExecutionMode.INTEGRATION
        docker_result = execute_tests_in_docker(
            test_code=full_code,
            source_code=source_code,
            language=language,
            env_vars=None,
            execution_mode=mode,
            timeout=180,
            config={'executor_type': None}
        )
    except Exception as e:
        update_test_queue_status(item_id, 'failed', error_message=f'Execution error: {str(e)}')
        return jsonify({'error': f'Failed to execute tests: {str(e)}'}), 500

    # Summarize results and update execution logs
    try:
        # Basic summary from exit code
        passed = 1 if docker_result.get('exit_code') == 0 else 0
        failed = 0 if passed == 1 else 1
        total_tests = len(legacy_response.get('testCases', [])) or (passed + failed)

        # Create and update execution log
        from data.test_execution import create_execution_log, update_execution_log_summary
        log_id = create_execution_log(ai_request_id, total_tests, test_type)
        overall_status = 'passed' if failed == 0 else 'failed'
        update_execution_log_summary(log_id, passed, failed, 0, overall_status, docker_result.get('output', '')[:500])

        # Update queue item status to done and attach minimal links (placeholder)
        database.execute_query(
            """
            UPDATE test_queue_items
            SET status = 'done', completed_at = CURRENT_TIMESTAMP,
                generated_tests_link = NULL,
                execution_logs_link = NULL,
                junit_report_link = NULL
            WHERE id = %(id)s
            """,
            params={'id': item_id},
            fetch=False,
        )

        return jsonify({
            'message': 'Run completed',
            'itemId': item_id,
            'testType': test_type,
            'status': 'done',
            'aiRequestId': ai_request_id,
            'executionLogId': log_id,
            'exitCode': docker_result.get('exit_code'),
        })
    except Exception as e:
        update_test_queue_status(item_id, 'failed', error_message=f'Post-processing error: {str(e)}')
        return jsonify({'error': f'Failed to finalize run: {str(e)}'}), 500


@queue_bp.route('/events/git', methods=['POST'])
@jwt_required(optional=True)
def ingest_git_event():
    """Ingest git webhook payloads to create pending test queue items.
    
    Supports GitHub push webhooks with optional signature verification.
    
    Headers:
        X-Hub-Signature-256: GitHub webhook signature (optional, enable with GITHUB_WEBHOOK_SECRET env var)
        X-GitHub-Event: GitHub event type (e.g., "push")
    
    Query params:
        project_id: Required project ID for the queue item
        branch_filter: Optional branch name filter (e.g., "main")
        webhook_secret: Optional override for webhook secret (useful for testing)
    
    Generic body schema:
    {
      "project_id": 1,
      "repo_url": "https://github.com/org/repo",
      "branch": "main",
      "commit_hash": "abc123",
      "commit_message": "feat: change utils",
      "author_name": "Dev",
      "author_email": "dev@example.com",
      "files": ["src/utils.ts", "src/main.ts"],
      "diff_summary": "2 files changed"
    }
    """
    # Extract headers
    github_signature = request.headers.get('X-Hub-Signature-256', '')
    github_event = request.headers.get('X-GitHub-Event', 'push')
    
    # Get webhook secret from environment or query params
    webhook_secret = (
        request.args.get('webhook_secret') or 
        os.environ.get('GITHUB_WEBHOOK_SECRET', '')
    )
    
    # Get raw payload for signature verification
    raw_payload = request.get_data()
    
    # Verify GitHub webhook signature if secret is configured
    if webhook_secret:
        if not verify_github_webhook_signature(raw_payload, github_signature, webhook_secret):
            logger.warning("Invalid GitHub webhook signature")
            return jsonify({'error': 'Invalid webhook signature'}), 401
        logger.info("GitHub webhook signature verified")
    else:
        logger.info("No webhook secret configured, skipping signature verification")
    
    payload = request.get_json(silent=True) or {}
    
    # Project resolution (required)
    project_id = request.args.get('project_id', type=int) or payload.get('project_id')
    if not project_id:
        logger.warning("Missing project_id in webhook")
        return jsonify({'error': 'project_id is required (query or body)'}), 400
    
    # Optional branch filter
    branch_filter = request.args.get('branch_filter')
    
    # Check if we should process this webhook
    if not should_trigger_tests(payload, branch_filter):
        return jsonify({
            'message': 'Webhook received but conditions not met for test trigger',
            'itemIds': []
        }), 200
    
    # Log webhook event type
    logger.info(f"Processing GitHub {github_event} event for project {project_id}")
    
    # Try GitHub push payload format first
    repo = (payload.get('repository') or {})
    head_commit = payload.get('head_commit')
    commits = payload.get('commits') or []

    def parse_branch(ref: str) -> str:
        # refs/heads/main -> main
        if not ref:
            return ''
        parts = ref.split('/')
        return parts[-1] if parts else ref

    def files_from_commit(commit_obj) -> list:
        if not commit_obj:
            return []
        added = commit_obj.get('added') or []
        modified = commit_obj.get('modified') or []
        # Typically exclude removed from testing scope
        files = list(set(added + modified))
        files.sort()
        return files

    created_ids = []

    if repo and (head_commit or commits):
        repo_url = repo.get('html_url') or repo.get('clone_url') or repo.get('url') or ''
        branch = parse_branch(payload.get('ref'))

        # Prefer head_commit; fallback to last commit in list
        commit_obj = head_commit or (commits[-1] if commits else None)
        files = files_from_commit(commit_obj)
        commit_hash = commit_obj.get('id') if commit_obj else ''
        commit_message = commit_obj.get('message') if commit_obj else ''
        author = commit_obj.get('author') or {}
        author_name = author.get('name')
        author_email = author.get('email')

        if not (repo_url and branch and commit_hash and files):
            logger.error("Missing required fields from GitHub webhook")
            return jsonify({'error': 'Missing required fields from webhook (repo/branch/commit/files)'}), 400

        logger.info(f"Creating queue item: {repo_url} branch={branch} commit={commit_hash} files={len(files)}")
        
        try:
            item_id = add_test_queue_item(
                project_id=project_id,
                repo_url=repo_url,
                branch=branch,
                commit_hash=commit_hash,
                commit_message=commit_message,
                author_name=author_name,
                author_email=author_email,
                triggered_by='github_webhook',
                file_list=files,
                diff_summary=payload.get('compare'),
                test_type=None,
            )
            created_ids.append(item_id)
            logger.info(f"Queue item created: id={item_id}")
        except Exception as e:
            logger.error(f"Failed to create queue item from GitHub webhook: {str(e)}")
            return jsonify({'error': f'Failed to create queue item: {str(e)}'}), 500

    else:
        # Generic schema
        repo_url = payload.get('repo_url')
        branch = payload.get('branch')
        commit_hash = payload.get('commit_hash')
        commit_message = payload.get('commit_message')
        author_name = payload.get('author_name')
        author_email = payload.get('author_email')
        files = payload.get('files') or []
        diff_summary = payload.get('diff_summary')

        if not (repo_url and branch and commit_hash and isinstance(files, list) and files):
            logger.error("Missing required fields from generic webhook payload")
            return jsonify({'error': 'Missing required fields (repo_url, branch, commit_hash, files[])'}), 400

        logger.info(f"Creating queue item (generic): {repo_url} branch={branch} commit={commit_hash} files={len(files)}")
        
        files = sorted(set(files))
        try:
            item_id = add_test_queue_item(
                project_id=project_id,
                repo_url=repo_url,
                branch=branch,
                commit_hash=commit_hash,
                commit_message=commit_message,
                author_name=author_name,
                author_email=author_email,
                triggered_by='generic_webhook',
                file_list=files,
                diff_summary=diff_summary,
                test_type=None,
            )
            created_ids.append(item_id)
            logger.info(f"Queue item created: id={item_id}")
        except Exception as e:
            logger.error(f"Failed to create queue item from generic webhook: {str(e)}")
            return jsonify({'error': f'Failed to create queue item: {str(e)}'}), 500

    logger.info(f"Webhook processing complete: {len(created_ids)} item(s) created")
    return jsonify({
        'message': 'Queue item(s) created successfully',
        'itemIds': created_ids,
        'count': len(created_ids)
    }), 201
