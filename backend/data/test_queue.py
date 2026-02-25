from typing import List, Optional, Any, Dict
from . import database
import json

# Data access layer for test_queue_items

def add_test_queue_item(
    project_id: int,
    repo_url: str,
    branch: str,
    commit_hash: str,
    commit_message: Optional[str],
    author_name: Optional[str],
    author_email: Optional[str],
    triggered_by: Optional[int],
    file_list: List[str],
    diff_summary: Optional[str] = None,
    test_type: Optional[str] = None,
) -> int:
    """Insert a new pending queue item and return its id.
    Deduplicates via unique constraint (project_id, commit_hash, file_list).
    """
    query = """
        INSERT INTO test_queue_items (
            project_id, repo_url, branch, commit_hash, commit_message,
            author_name, author_email, triggered_by,
            file_list, diff_summary, test_type
        ) VALUES (
            %(project_id)s, %(repo_url)s, %(branch)s, %(commit_hash)s, %(commit_message)s,
            %(author_name)s, %(author_email)s, %(triggered_by)s,
            %(file_list)s, %(diff_summary)s, %(test_type)s
        )
        ON CONFLICT ON CONSTRAINT unique_pending_item DO NOTHING
        RETURNING id;
    """
    params = {
        "project_id": project_id,
        "repo_url": repo_url,
        "branch": branch,
        "commit_hash": commit_hash,
        "commit_message": commit_message,
        "author_name": author_name,
        "author_email": author_email,
        "triggered_by": triggered_by,
        "file_list": json.dumps(file_list),
        "diff_summary": diff_summary,
        "test_type": test_type,
    }
    result = database.execute_query(query, params=params, fetch=True, fetch_one=True)
    # If dedup, RETURNING id yields None; fetch the existing id
    if result and "id" in result and result["id"] is not None:
        return result["id"]

    # Fallback: find existing item by unique key
    fallback = database.execute_query(
        """
        SELECT id FROM test_queue_items
        WHERE project_id = %(project_id)s AND commit_hash = %(commit_hash)s AND file_list = %(file_list)s
        LIMIT 1;
        """,
        params={
            "project_id": project_id,
            "commit_hash": commit_hash,
            "file_list": json.dumps(file_list),
        },
        fetch=True,
        fetch_one=True,
    )
    return fallback["id"] if fallback else 0


def list_test_queue_items(
    status: Optional[str] = None,
    project_id: Optional[int] = None,
    limit: int = 50,
    offset: int = 0,
) -> List[Dict[str, Any]]:
    """List queue items with optional filters."""
    base = "SELECT * FROM test_queue_items"
    clauses = []
    params: Dict[str, Any] = {"limit": limit, "offset": offset}
    if status:
        clauses.append("status = %(status)s")
        params["status"] = status
    if project_id:
        clauses.append("project_id = %(project_id)s")
        params["project_id"] = project_id
    if clauses:
        base += " WHERE " + " AND ".join(clauses)
    base += " ORDER BY created_at DESC LIMIT %(limit)s OFFSET %(offset)s;"
    
    items = database.execute_query(base, params=params, fetch=True)
    
    # Deserialize file_list JSON
    for it in items:
        try:
            it["file_list"] = json.loads(it.get("file_list", "[]"))
        except Exception:
            pass
    return items


def get_test_queue_item(item_id: int) -> Optional[Dict[str, Any]]:
    """Fetch a single queue item by id."""
    item = database.execute_query(
        "SELECT * FROM test_queue_items WHERE id = %(id)s;",
        params={"id": item_id},
        fetch=True,
        fetch_one=True,
    )
    if item and "file_list" in item:
        try:
            item["file_list"] = json.loads(item["file_list"])
        except Exception:
            pass
    return item


def update_test_queue_status(
    item_id: int,
    status: str,
    error_message: Optional[str] = None,
    generated_tests_link: Optional[str] = None,
    execution_logs_link: Optional[str] = None,
    junit_report_link: Optional[str] = None,
) -> bool:
    """Update status and optional artifact links for a queue item."""
    query = """
        UPDATE test_queue_items
        SET status = %(status)s,
            error_message = COALESCE(%(error_message)s, error_message),
            generated_tests_link = COALESCE(%(generated_tests_link)s, generated_tests_link),
            execution_logs_link = COALESCE(%(execution_logs_link)s, execution_logs_link),
            junit_report_link = COALESCE(%(junit_report_link)s, junit_report_link)
        WHERE id = %(id)s;
    """
    params = {
        "id": item_id,
        "status": status,
        "error_message": error_message,
        "generated_tests_link": generated_tests_link,
        "execution_logs_link": execution_logs_link,
        "junit_report_link": junit_report_link,
    }
    return database.execute_query(query, params=params, fetch=False)
