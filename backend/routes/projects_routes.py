from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from pydantic import BaseModel, Field, ValidationError
from psycopg2.errors import UniqueViolation
from flasgger import swag_from
import data.database as database
from data.test_queue import add_test_queue_item
from utils.validation import ProjectCreateRequest, ProjectUpdateRequest
from utils.api_response import error_response, validation_error_response, success_response
from utils.logger import setup_logger
from utils.retry import retry_on_connection_error
import requests
from datetime import datetime
import os
from urllib.parse import quote

logger = setup_logger(__name__)

projects_bp = Blueprint('projects', __name__, url_prefix='/api')

# API tokens for higher rate limits (optional)
GITHUB_TOKEN = os.environ.get('GITHUB_TOKEN', None)
GITLAB_TOKEN = os.environ.get('GITLAB_TOKEN', None)

# Retry-wrapped API call function
@retry_on_connection_error(max_attempts=3)
def fetch_external_api(url: str, **kwargs):
    """
    Fetch from external API with automatic retry on connection errors.
    
    Args:
        url: API endpoint URL
        **kwargs: Additional arguments for requests.get()
    
    Returns:
        requests.Response object
    """
    response = requests.get(url, **kwargs)
    response.raise_for_status()  # Raise exception for 4xx/5xx responses
    return response


# ==================== PROVIDER-AWARE API HELPERS ====================

def parse_repo_url(repo_url: str, provider: str) -> tuple:
    """Parse repository URL and return path components."""
    parts = repo_url.rstrip('/').split('/')
    if len(parts) < 2:
        raise ValueError(f"Invalid {provider.upper()} repository URL")
    
    owner = parts[-2]
    repo = parts[-1]
    
    if provider.lower() == 'gitlab':
        return (f"{owner}/{repo}",)
    else:
        return (owner, repo)


def get_commits_api_url(repo_url: str, provider: str) -> str:
    """Get the API URL for fetching commits based on provider."""
    if provider.lower() == 'gitlab':
        project_path = parse_repo_url(repo_url, provider)[0]
        encoded_path = quote(project_path, safe='')
        return f"https://gitlab.com/api/v4/projects/{encoded_path}/repository/commits"
    else:
        owner, repo = parse_repo_url(repo_url, provider)
        return f"https://api.github.com/repos/{owner}/{repo}/commits"


def get_commit_detail_api_url(repo_url: str, commit_hash: str, provider: str) -> str:
    """Get the API URL for fetching a specific commit's details.

    Note: For GitLab, commit details do not include file changes; use the diff endpoint.
    """
    if provider.lower() == 'gitlab':
        project_path = parse_repo_url(repo_url, provider)[0]
        encoded_path = quote(project_path, safe='')
        # Use the diff endpoint to retrieve changed files
        return f"https://gitlab.com/api/v4/projects/{encoded_path}/repository/commits/{commit_hash}/diff"
    else:
        owner, repo = parse_repo_url(repo_url, provider)
        return f"https://api.github.com/repos/{owner}/{repo}/commits/{commit_hash}"


def get_headers_for_provider(provider: str) -> dict:
    """Get authorization headers for the specified provider."""
    headers = {}
    if provider.lower() == 'gitlab' and GITLAB_TOKEN:
        headers['PRIVATE-TOKEN'] = GITLAB_TOKEN
    elif provider.lower() == 'github' and GITHUB_TOKEN:
        headers['Authorization'] = f'token {GITHUB_TOKEN}'
    return headers


def extract_commit_data_from_response(commit: dict, provider: str) -> dict:
    """Extract commit data from API response based on provider."""
    if provider.lower() == 'gitlab':
        return {
            'hash': commit.get('id', ''),
            'message': commit.get('message', ''),
            'author_name': commit.get('author_name', 'Unknown'),
            'author_email': commit.get('author_email', ''),
            'files': []
        }
    else:
        return {
            'hash': commit.get('sha', ''),
            'message': commit.get('commit', {}).get('message', ''),
            'author_name': commit.get('commit', {}).get('author', {}).get('name', 'Unknown'),
            'author_email': commit.get('commit', {}).get('author', {}).get('email', ''),
            'files': commit.get('files', [])
        }


def extract_files_from_commit_detail(commit_detail, provider: str) -> list:
    """Extract file list from commit detail response based on provider.

    For GitLab, the diff endpoint returns a list of diff objects.
    For GitHub, the commit detail includes a 'files' array.
    """
    if provider.lower() == 'gitlab':
        if isinstance(commit_detail, list):
            return [d.get('new_path') or d.get('old_path') or '' for d in commit_detail if isinstance(d, dict)]
        return []
    else:
        files = commit_detail.get('files', [])
        return [f.get('filename', '') for f in files] if files else []


# ------------------ INPUT VALIDATION ------------------
class ProjectCreateSchema(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    description: str | None = None


# ------------------ ROUTE HANDLER ------------------
@projects_bp.route('/projects', methods=['POST'])
@jwt_required()
def create_project():
    """Create a project for the authenticated user."""
    
    try:
        # Current user ID extracted from JWT token (convert to int)
        user_id = int(get_jwt_identity())

        # Parse and validate incoming JSON
        payload = request.get_json() or {}
        data = ProjectCreateSchema(**payload)

        # DB insert using safe context managers 
        conn = database.get_db_connection()
        with conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO projects (user_id, name, description)
                    VALUES (%s, %s, %s)
                    RETURNING id, name, description, created_at
                    """,
                    (user_id, data.name, data.description)
                )
                row = cur.fetchone()

        response = {
            "id": row[0],
            "name": row[1],
            "description": row[2],
            "created_at": row[3].isoformat(),
        }

        return jsonify(response), 201

    except ValidationError as ve:
        # Pydantic input validation issues
        return jsonify({"error": ve.errors()}), 400

    except UniqueViolation:
        # For example: if you later disallow duplicate project names
        return jsonify({"error": "Project must be unique"}), 400

    except Exception as e:
        # Log internal error but hide details from client
        print(f"[ERROR] create_project: {e}")
        return jsonify({"error": "Internal server error"}), 500

#this is the delete project route
@projects_bp.route('/projects/<int:project_id>', methods=['DELETE'])
@jwt_required()
def delete_project(project_id):
    """Delete a project for the authenticated user."""
    
    try:
        # Current user ID extracted from JWT token
        user_id = int(get_jwt_identity())

        conn = database.get_db_connection()
        with conn:
            with conn.cursor() as cur:
                # First check if project belongs to user
                cur.execute(
                    "SELECT id FROM projects WHERE id = %s AND user_id = %s",
                    (project_id, user_id)
                )
                if not cur.fetchone():
                    return jsonify({"error": "Project not found or access denied"}), 404

                # Delete the project (cascades to related data if configured)
                cur.execute(
                    "DELETE FROM projects WHERE id = %s AND user_id = %s",
                    (project_id, user_id)
                )

        return jsonify({"message": "Project deleted successfully"}), 200

    except Exception as e:
        print(f"[ERROR] delete_project: {e}")
        return jsonify({"error": "Internal server error"}), 500


@projects_bp.route('/projects/<int:project_id>', methods=['GET'])
@jwt_required()
def get_project(project_id):
    """Get a single project by ID."""
    
    try:
        user_id = int(get_jwt_identity())
        
        conn = database.get_db_connection()
        with conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT id, name, description, created_at, github_repo_url, github_baseline_timestamp, git_provider
                    FROM projects 
                    WHERE id = %s AND user_id = %s
                    """,
                    (project_id, user_id)
                )
                row = cur.fetchone()
        
        if not row:
            return jsonify({"error": "Project not found or access denied"}), 404
        
        response = {
            "id": row[0],
            "name": row[1],
            "description": row[2],
            "created_at": row[3].isoformat() if row[3] else None,
            "github_repo_url": row[4],
            "github_baseline_timestamp": row[5].isoformat() if row[5] else None,
            "git_provider": row[6] if len(row) > 6 and row[6] else 'github',
        }
        
        return jsonify(response), 200
    
    except Exception as e:
        print(f"[ERROR] get_project: {e}")
        return jsonify({"error": "Internal server error"}), 500
    
    # This is the edit project route
@projects_bp.route('/projects/<int:project_id>', methods=['PUT'])
@jwt_required()
def update_project(project_id):
    """Update a project name for the authenticated user."""
    
    try:
        # Current user ID extracted from JWT token
        user_id = int(get_jwt_identity())

        # Parse incoming JSON
        payload = request.get_json() or {}
        new_name = payload.get('name', '').strip()

        if not new_name:
            return jsonify({"error": "Project name cannot be empty"}), 400

        if len(new_name) > 100:
            return jsonify({"error": "Project name too long (max 100 characters)"}), 400

        conn = database.get_db_connection()
        with conn:
            with conn.cursor() as cur:
                # First check if project belongs to user
                cur.execute(
                    "SELECT id FROM projects WHERE id = %s AND user_id = %s",
                    (project_id, user_id)
                )
                if not cur.fetchone():
                    return jsonify({"error": "Project not found or access denied"}), 404

                # Update the project name
                cur.execute(
                    """
                    UPDATE projects 
                    SET name = %s 
                    WHERE id = %s AND user_id = %s
                    RETURNING id, name, description, created_at
                    """,
                    (new_name, project_id, user_id)
                )
                row = cur.fetchone()

        response = {
            "id": row[0],
            "name": row[1],
            "description": row[2],
            "created_at": row[3].isoformat() if row[3] else None,
        }

        return jsonify(response), 200

    except Exception as e:
        print(f"[ERROR] update_project: {e}")
        return jsonify({"error": "Internal server error"}), 500


# ==================== GITHUB REPO MANAGEMENT ====================

@projects_bp.route('/projects/<int:project_id>/github-repo', methods=['POST'])
@jwt_required()
def set_github_repo(project_id):
    """Set Git repository URL for a project (GitHub or GitLab).
    
    Body: { "repo_url": "https://github.com/owner/repo", "git_provider": "github" | "gitlab" }
    """
    try:
        user_id = int(get_jwt_identity())
        payload = request.get_json() or {}
        repo_url = payload.get('repo_url', '').strip()
        git_provider = payload.get('git_provider', 'github').lower()
        
        if not repo_url:
            return jsonify({"error": "repo_url is required"}), 400
        
        if git_provider not in ['github', 'gitlab']:
            return jsonify({"error": "git_provider must be 'github' or 'gitlab'"}), 400
        
        # Validate URL format based on provider
        if git_provider == 'github' and not repo_url.startswith('https://github.com/'):
            return jsonify({"error": "Invalid GitHub URL format"}), 400
        elif git_provider == 'gitlab' and not repo_url.startswith('https://gitlab.com/'):
            return jsonify({"error": "Invalid GitLab URL format"}), 400
        
        # Verify project belongs to user
        conn = database.get_db_connection()
        with conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT id FROM projects WHERE id = %s AND user_id = %s",
                    (project_id, user_id)
                )
                if not cur.fetchone():
                    return jsonify({"error": "Project not found or access denied"}), 404
                
                # Set baseline timestamp to NOW (to filter out old commits)
                baseline_timestamp = datetime.utcnow()
                
                # Update git repo info, provider, and baseline timestamp
                cur.execute(
                    """
                    UPDATE projects
                    SET github_repo_url = %s, git_provider = %s, github_baseline_timestamp = %s
                    WHERE id = %s AND user_id = %s
                    RETURNING id, name, github_repo_url, git_provider, github_baseline_timestamp
                    """,
                    (repo_url, git_provider, baseline_timestamp, project_id, user_id)
                )
                row = cur.fetchone()
        
        logger.info(f"GitHub repo set for project {project_id}: {repo_url} (baseline: {baseline_timestamp})")
        
        # Automatically fetch and add all NEW commits to queue
        try:
            auto_add_commits_to_queue(project_id, repo_url, baseline_timestamp, git_provider)
            logger.info(f"Auto-added commits to queue for project {project_id} ({git_provider})")
        except Exception as e:
            logger.warning(f"Failed to auto-add commits: {e}")
        
        return jsonify({
            "id": row[0],
            "name": row[1],
            "github_repo_url": row[2],
            "git_provider": row[3],
            "github_baseline_timestamp": row[4].isoformat() if row[4] else None
        }), 200
    
    except Exception as e:
        logger.error(f"Error setting GitHub repo: {e}")
        return jsonify({"error": "Internal server error"}), 500


@projects_bp.route('/projects/<int:project_id>/github-commits', methods=['GET'])
@jwt_required()
def fetch_github_commits(project_id):
    """Fetch recent commits from project's GitHub repo.
    
    Query params:
        - branch: Branch name (default: main)
        - per_page: Number of commits to fetch (default: 20, max: 100)
        - page: Pagination page (default: 1)
    """
    try:
        user_id = int(get_jwt_identity())
        
        # Get project, repo URL, and baseline timestamp
        conn = database.get_db_connection()
        with conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT id, github_repo_url, github_baseline_timestamp, git_provider FROM projects WHERE id = %s AND user_id = %s",
                    (project_id, user_id)
                )
                result = cur.fetchone()
        
        if not result:
            return jsonify({"error": "Project not found or access denied"}), 404
        
        repo_url = result[1]
        baseline_timestamp = result[2]
        git_provider = result[3] if result[3] else 'github'
        
        if not repo_url:
            return jsonify({"error": "Repository not configured for this project"}), 400
        
        # Get query parameters
        branch = request.args.get('branch', 'main')
        per_page = min(int(request.args.get('per_page', 20)), 100)
        page = int(request.args.get('page', 1))
        
        try:
            parse_repo_url(repo_url, git_provider)
        except ValueError as e:
            return jsonify({"error": str(e)}), 400
        
        # Fetch commits from appropriate API
        api_url = get_commits_api_url(repo_url, git_provider)
        headers = get_headers_for_provider(git_provider)
        
        if git_provider.lower() == 'gitlab':
            params = {
                'ref_name': branch,
                'per_page': per_page,
                'page': page
            }
            if baseline_timestamp:
                params['since'] = baseline_timestamp.isoformat()
        else:
            params = {
                'sha': branch,
                'per_page': per_page,
                'page': page
            }
            if baseline_timestamp:
                params['since'] = baseline_timestamp.isoformat()
        
        logger.info(f"Fetching commits from {api_url} for branch {branch} (provider: {git_provider})")
        
        response = fetch_external_api(api_url, params=params, headers=headers, timeout=10)
        
        commits = response.json()
        
        # Format commits for frontend
        formatted_commits = []
        for commit in commits:
            commit_data = extract_commit_data_from_response(commit, git_provider)
            formatted_commits.append({
                'hash': commit_data['hash'],
                'message': commit_data['message'],
                'author': {
                    'name': commit['commit']['author'].get('name', 'Unknown'),
                    'email': commit['commit']['author'].get('email', ''),
                    'avatar_url': commit['author']['avatar_url'] if commit.get('author') else None
                },
                'url': commit['html_url'],
                'timestamp': commit['commit']['author'].get('date'),
                'files_changed': len(commit.get('files', []))
            })
        
        logger.info(f"Fetched {len(formatted_commits)} commits from provider {git_provider}")
        
        return jsonify({
            'commits': formatted_commits,
            'repo': f"{owner}/{repo}",
            'branch': branch,
            'count': len(formatted_commits),
            'page': page,
            'per_page': per_page
        }), 200
    
    except requests.exceptions.RequestException as e:
        logger.error(f"GitHub API error: {e}")
        return jsonify({"error": "Failed to fetch commits from GitHub"}), 500
    except Exception as e:
        logger.error(f"Error fetching commits: {e}")
        return jsonify({"error": "Internal server error"}), 500


@projects_bp.route('/projects/<int:project_id>/sync-commits', methods=['POST'])
@jwt_required()
def sync_commits_to_queue(project_id):
    """Synchronize (fetch and add) new commits from GitHub to the queue.
    
    This endpoint checks for commits added since the last sync and adds them
    to the test queue. Useful for manual sync or polling.
    
    Query params:
        - branch: Branch name to sync (default: main)
    """
    try:
        user_id = int(get_jwt_identity())
        
        # Get project and repository info
        conn = database.get_db_connection()
        with conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT id, github_repo_url, github_baseline_timestamp, git_provider
                    FROM projects 
                    WHERE id = %s AND user_id = %s
                    """,
                    (project_id, user_id)
                )
                result = cur.fetchone()
        
        if not result:
            return jsonify({"error": "Project not found or access denied"}), 404
        
        project_id_db = result[0]
        repo_url = result[1]
        baseline_timestamp = result[2]
        git_provider = result[3] if result[3] else 'github'
        
        if not repo_url:
            return jsonify({"error": "Repository not configured for this project"}), 400
        
        # Get branch from query params
        branch = request.args.get('branch', 'main')
        
        try:
            parse_repo_url(repo_url, git_provider)
        except ValueError as e:
            return jsonify({"error": str(e)}), 400
        
        # Fetch commits from appropriate API
        api_url = get_commits_api_url(repo_url, git_provider)
        headers = get_headers_for_provider(git_provider)
        
        if git_provider.lower() == 'gitlab':
            params = {'ref_name': branch, 'per_page': 5}
        else:
            params = {'sha': branch, 'per_page': 5}
        
        # NOTE: We intentionally DON'T filter by baseline_timestamp for manual sync
        # Manual sync should get recent commits regardless of when repo was connected
        # (baseline is only used for auto-add on initial connection)
        
        logger.info(f"Manual sync: fetching commits from {api_url} (provider: {git_provider})")
        
        response = fetch_external_api(api_url, params=params, headers=headers, timeout=10)
        
        commits = response.json()
        
        # Add each commit to the queue
        added_items = []
        for commit in commits:
            try:
                commit_data = extract_commit_data_from_response(commit, git_provider)
                commit_hash = commit_data['hash']
                commit_message = commit_data['message']
                author_name = commit_data['author_name']
                author_email = commit_data['author_email']
                
                # Fetch individual commit details to get file list
                commit_detail_url = get_commit_detail_api_url(repo_url, commit_hash, git_provider)
                
                try:
                    detail_response = fetch_external_api(commit_detail_url, headers=headers, timeout=10)
                    commit_details = detail_response.json()
                    
                    file_list = extract_files_from_commit_detail(commit_details, git_provider)
                except requests.exceptions.RequestException as e:
                    logger.warning(f"Could not fetch commit details for {commit_hash}: {e}")
                    file_list = ['(unable to fetch files - rate limit)']
                
                # Don't skip commits without files - add them anyway
                if not file_list:
                    file_list = ['(no files changed)']
                
                # Add to queue (deduplication handled by database constraint)
                item_id = add_test_queue_item(
                    project_id=project_id_db,
                    repo_url=repo_url,
                    branch=branch,
                    commit_hash=commit_hash,
                    commit_message=commit_message,
                    author_name=author_name,
                    author_email=author_email,
                    triggered_by=None,  # Automatic trigger
                    file_list=file_list,
                    diff_summary=None,
                    test_type=None  # User will choose later
                )
                
                if item_id > 0:
                    added_items.append({
                        'id': item_id,
                        'commit_hash': commit_hash[:8],
                        'message': commit_message.split('\n')[0]  # First line of message
                    })
            
            except Exception as e:
                continue
        
        return jsonify({
            "message": f"Successfully synced {len(added_items)} commits",
            "added_count": len(added_items),
            "added_items": added_items,
            "branch": branch,
            "total_commits_found": len(commits),
            "baseline_timestamp": baseline_timestamp.isoformat() if baseline_timestamp else None
        }), 200
    
    except requests.exceptions.RequestException as e:
        logger.error(f"Git API error during sync: {e}")
        return jsonify({"error": f"Failed to fetch commits: {str(e)}"}), 500
    except Exception as e:
        logger.error(f"Error syncing commits: {e}", exc_info=True)
        return jsonify({"error": f"Internal server error: {str(e)}"}), 500


def auto_add_commits_to_queue(project_id: int, repo_url: str, baseline_timestamp: datetime, git_provider: str = 'github'):
    """Automatically fetch and add all commits after baseline to queue.
    
    This function is called when a repo is first connected.
    It fetches all commits since the baseline timestamp and adds them to the queue.
    Supports both GitHub and GitLab.
    """
    try:
        parse_repo_url(repo_url, git_provider)
    except ValueError as e:
        raise ValueError(str(e))
    
    # Fetch commits from appropriate API
    api_url = get_commits_api_url(repo_url, git_provider)
    headers = get_headers_for_provider(git_provider)
    
    if git_provider.lower() == 'gitlab':
        params = {
            'ref_name': 'main',
            'per_page': 20,
            'since': baseline_timestamp.isoformat()
        }
    else:
        params = {
            'sha': 'main',
            'per_page': 20,
            'since': baseline_timestamp.isoformat()
        }
    
    logger.info(f"Auto-fetching commits from {api_url} since {baseline_timestamp} (provider: {git_provider})")
    
    response = fetch_external_api(api_url, params=params, headers=headers, timeout=10)
    
    commits = response.json()
    
    logger.info(f"Found {len(commits)} commits from API")
    
    # Add each commit to the queue
    added_count = 0
    for commit in commits:
        try:
            commit_data = extract_commit_data_from_response(commit, git_provider)
            commit_hash = commit_data['hash']
            commit_message = commit_data['message']
            author_name = commit_data['author_name']
            author_email = commit_data['author_email']
            
            # Fetch individual commit details to get file list
            commit_detail_url = get_commit_detail_api_url(repo_url, commit_hash, git_provider)
            logger.info(f"Fetching details for commit {commit_hash[:8]}")
            
            try:
                detail_response = fetch_external_api(commit_detail_url, headers=headers, timeout=10)
                commit_details = detail_response.json()
                
                file_list = extract_files_from_commit_detail(commit_details, git_provider)
            except requests.exceptions.RequestException as e:
                logger.warning(f"Failed to fetch details for commit {commit_hash[:8]}: {e}")
                file_list = ['(unable to fetch files - rate limit)']
            
            # Don't skip commits without files - add them anyway
            if not file_list:
                file_list = ['(no files changed)']
            
            logger.info(f"Commit {commit_hash[:8]} has {len(file_list)} files: {file_list}")
            
            # Add to queue (deduplication handled by database constraint)
            item_id = add_test_queue_item(
                project_id=project_id,
                repo_url=repo_url,
                branch='main',
                commit_hash=commit_hash,
                commit_message=commit_message,
                author_name=author_name,
                author_email=author_email,
                triggered_by=None,  # Automatic trigger
                file_list=file_list,
                diff_summary=None,
                test_type=None  # User will choose later
            )
            
            if item_id > 0:
                added_count += 1
                logger.info(f"Added commit {commit_hash[:8]} to queue (id={item_id})")
        
        except Exception as e:
            logger.warning(f"Failed to add commit {commit.get('id', commit.get('sha', 'unknown'))}: {e}")
            continue
    
    logger.info(f"Auto-added {added_count} commits to queue for project {project_id}")
    return added_count


# ============================================================================
# PROJECT SETTINGS ROUTES
# ============================================================================

@projects_bp.route('/projects/<int:project_id>/settings', methods=['GET'])
@jwt_required()
@swag_from({
    'tags': ['Projects'],
    'summary': 'Get project settings',
    'description': 'Retrieve configuration settings for a project',
    'parameters': [
        {
            'name': 'project_id',
            'in': 'path',
            'type': 'integer',
            'required': True,
            'description': 'Project ID'
        }
    ],
    'responses': {
        200: {
            'description': 'Project settings',
            'schema': {
                'type': 'object',
                'properties': {
                    'default_test_framework': {'type': 'string', 'example': 'pytest'},
                    'coverage_goal': {'type': 'integer', 'example': 80},
                    'llm_preset': {'type': 'string', 'example': 'balanced'},
                    'llm_temperature': {'type': 'number', 'example': 0.7},
                    'max_tokens': {'type': 'integer', 'example': 2000}
                }
            }
        },
        404: {'description': 'Project not found', 'schema': {'$ref': '#/definitions/Error'}}
    },
    'security': [{'Bearer': []}]
})
def get_project_settings(project_id):
    """Get project configuration settings."""
    try:
        conn = database.get_db_connection()
        cur = conn.cursor()
        
        cur.execute('''
            SELECT default_test_framework, coverage_goal, llm_preset, 
                   llm_temperature, max_tokens
            FROM projects
            WHERE id = %s
        ''', (project_id,))
        
        project = cur.fetchone()
        cur.close()
        database.return_db_connection(conn)
        
        if not project:
            return APIResponse.error('Project not found', ErrorCodes.NOT_FOUND), 404
        
        settings = {
            'default_test_framework': project[0],
            'coverage_goal': project[1],
            'llm_preset': project[2],
            'llm_temperature': float(project[3]) if project[3] else None,
            'max_tokens': project[4]
        }
        
        return APIResponse.success(
            data=settings,
            message='Project settings retrieved'
        )
    
    except Exception as e:
        logger.exception(f"Error getting project settings: {e}")
        return APIResponse.error(str(e), ErrorCodes.INTERNAL_SERVER_ERROR), 500


@projects_bp.route('/projects/<int:project_id>/settings', methods=['PUT'])
@jwt_required()
@swag_from({
    'tags': ['Projects'],
    'summary': 'Update project settings',
    'description': 'Update configuration settings for a project',
    'parameters': [
        {
            'name': 'project_id',
            'in': 'path',
            'type': 'integer',
            'required': True,
            'description': 'Project ID'
        },
        {
            'name': 'body',
            'in': 'body',
            'required': True,
            'schema': {
                'type': 'object',
                'properties': {
                    'default_test_framework': {
                        'type': 'string',
                        'enum': ['pytest', 'unittest', 'jest', 'mocha', 'junit', 'testng'],
                        'description': 'Default test framework'
                    },
                    'coverage_goal': {
                        'type': 'integer',
                        'minimum': 0,
                        'maximum': 100,
                        'description': 'Target code coverage percentage'
                    },
                    'llm_preset': {
                        'type': 'string',
                        'enum': ['fast', 'balanced', 'thorough'],
                        'description': 'LLM generation preset'
                    },
                    'llm_temperature': {
                        'type': 'number',
                        'minimum': 0.0,
                        'maximum': 1.0,
                        'description': 'LLM temperature (creativity level)'
                    },
                    'max_tokens': {
                        'type': 'integer',
                        'minimum': 100,
                        'maximum': 8000,
                        'description': 'Maximum tokens for LLM responses'
                    }
                }
            }
        }
    ],
    'responses': {
        200: {'description': 'Settings updated', 'schema': {'$ref': '#/definitions/Success'}},
        400: {'description': 'Validation error', 'schema': {'$ref': '#/definitions/Error'}},
        404: {'description': 'Project not found', 'schema': {'$ref': '#/definitions/Error'}}
    },
    'security': [{'Bearer': []}]
})
def update_project_settings(project_id):
    """Update project configuration settings."""
    try:
        data = request.get_json()
        
        conn = database.get_db_connection()
        cur = conn.cursor()
        
        # Check project exists
        cur.execute('SELECT id FROM projects WHERE id = %s', (project_id,))
        if not cur.fetchone():
            cur.close()
            database.return_db_connection(conn)
            return APIResponse.error('Project not found', ErrorCodes.NOT_FOUND), 404
        
        # Build update query dynamically
        update_fields = []
        values = []
        
        if data.default_test_framework is not None:
            update_fields.append('default_test_framework = %s')
            values.append(data.default_test_framework)
        
        if data.coverage_goal is not None:
            update_fields.append('coverage_goal = %s')
            values.append(data.coverage_goal)
        
        if data.llm_preset is not None:
            update_fields.append('llm_preset = %s')
            values.append(data.llm_preset)
        
        if data.llm_temperature is not None:
            update_fields.append('llm_temperature = %s')
            values.append(data.llm_temperature)
        
        if data.max_tokens is not None:
            update_fields.append('max_tokens = %s')
            values.append(data.max_tokens)
        
        if not update_fields:
            cur.close()
            database.return_db_connection(conn)
            return APIResponse.error('No fields to update', ErrorCodes.VALIDATION_ERROR), 400
        
        values.append(project_id)
        query = f"UPDATE projects SET {', '.join(update_fields)} WHERE id = %s"
        
        cur.execute(query, values)
        conn.commit()
        
        # Get updated settings
        cur.execute('''
            SELECT default_test_framework, coverage_goal, llm_preset, 
                   llm_temperature, max_tokens
            FROM projects
            WHERE id = %s
        ''', (project_id,))
        
        updated_project = cur.fetchone()
        cur.close()
        database.return_db_connection(conn)
        
        settings = {
            'default_test_framework': updated_project[0],
            'coverage_goal': updated_project[1],
            'llm_preset': updated_project[2],
            'llm_temperature': float(updated_project[3]) if updated_project[3] else None,
            'max_tokens': updated_project[4]
        }
        
        logger.info(f"Project {project_id} settings updated")
        
        return APIResponse.success(
            data=settings,
            message='Project settings updated successfully'
        )
    
    except Exception as e:
        logger.exception(f"Error updating project settings: {e}")
        return APIResponse.error(str(e), ErrorCodes.INTERNAL_SERVER_ERROR), 500


@projects_bp.route('/projects/<int:project_id>/settings/presets', methods=['GET'])
@jwt_required()
@swag_from({
    'tags': ['Projects'],
    'summary': 'Get available LLM presets',
    'description': 'Get list of available LLM generation presets with descriptions',
    'parameters': [
        {
            'name': 'project_id',
            'in': 'path',
            'type': 'integer',
            'required': True,
            'description': 'Project ID'
        }
    ],
    'responses': {
        200: {'description': 'Available presets', 'schema': {'$ref': '#/definitions/Success'}}
    },
    'security': [{'Bearer': []}]
})
def get_llm_presets(project_id):
    """Get available LLM presets."""
    presets = {
        'fast': {
            'name': 'Fast',
            'description': 'Quick test generation with basic coverage',
            'temperature': 0.5,
            'max_tokens': 1000,
            'recommended_for': ['Unit tests', 'Simple functions', 'Quick iterations']
        },
        'balanced': {
            'name': 'Balanced',
            'description': 'Good balance between speed and thoroughness',
            'temperature': 0.7,
            'max_tokens': 2000,
            'recommended_for': ['Most use cases', 'API tests', 'Integration tests']
        },
        'thorough': {
            'name': 'Thorough',
            'description': 'Comprehensive test generation with edge cases',
            'temperature': 0.8,
            'max_tokens': 4000,
            'recommended_for': ['Complex logic', 'Critical paths', 'Security-sensitive code']
        }
    }
    
    return APIResponse.success(
        data={'presets': presets},
        message='LLM presets retrieved'
    )


@projects_bp.route('/projects/<int:project_id>/settings/frameworks', methods=['GET'])
@jwt_required()
@swag_from({
    'tags': ['Projects'],
    'summary': 'Get available test frameworks',
    'description': 'Get list of supported test frameworks for each language',
    'parameters': [
        {
            'name': 'project_id',
            'in': 'path',
            'type': 'integer',
            'required': True,
            'description': 'Project ID'
        }
    ],
    'responses': {
        200: {'description': 'Available frameworks', 'schema': {'$ref': '#/definitions/Success'}}
    },
    'security': [{'Bearer': []}]
})
def get_test_frameworks(project_id):
    """Get available test frameworks."""
    frameworks = {
        'python': [
            {
                'id': 'pytest',
                'name': 'pytest',
                'description': 'Most popular Python testing framework',
                'features': ['Fixtures', 'Parametrization', 'Plugins']
            },
            {
                'id': 'unittest',
                'name': 'unittest',
                'description': 'Built-in Python testing framework',
                'features': ['Standard library', 'xUnit style', 'No dependencies']
            }
        ],
        'javascript': [
            {
                'id': 'jest',
                'name': 'Jest',
                'description': 'Delightful JavaScript testing',
                'features': ['Snapshot testing', 'Mocking', 'Coverage']
            },
            {
                'id': 'mocha',
                'name': 'Mocha',
                'description': 'Flexible JavaScript test framework',
                'features': ['Async support', 'Multiple reporters', 'Extensible']
            }
        ],
        'java': [
            {
                'id': 'junit',
                'name': 'JUnit',
                'description': 'Standard Java testing framework',
                'features': ['Annotations', 'Assertions', 'Test runners']
            },
            {
                'id': 'testng',
                'name': 'TestNG',
                'description': 'Advanced Java testing framework',
                'features': ['Parallel execution', 'Data providers', 'Dependencies']
            }
        ]
    }
    
    return APIResponse.success(
        data={'frameworks': frameworks},
        message='Test frameworks retrieved'
    )


@projects_bp.route('/projects/<int:project_id>/settings/reset', methods=['POST'])
@jwt_required()
@swag_from({
    'tags': ['Projects'],
    'summary': 'Reset project settings to defaults',
    'description': 'Reset all project settings to default values',
    'parameters': [
        {
            'name': 'project_id',
            'in': 'path',
            'type': 'integer',
            'required': True,
            'description': 'Project ID'
        }
    ],
    'responses': {
        200: {'description': 'Settings reset', 'schema': {'$ref': '#/definitions/Success'}},
        404: {'description': 'Project not found', 'schema': {'$ref': '#/definitions/Error'}}
    },
    'security': [{'Bearer': []}]
})
def reset_project_settings(project_id):
    """Reset project settings to defaults."""
    try:
        conn = database.get_db_connection()
        cur = conn.cursor()
        
        # Check project exists
        cur.execute('SELECT id FROM projects WHERE id = %s', (project_id,))
        if not cur.fetchone():
            cur.close()
            database.return_db_connection(conn)
            return APIResponse.error('Project not found', ErrorCodes.NOT_FOUND), 404
        
        # Reset to defaults
        cur.execute('''
            UPDATE projects
            SET default_test_framework = NULL,
                coverage_goal = 80,
                llm_preset = 'balanced',
                llm_temperature = 0.7,
                max_tokens = 2000
            WHERE id = %s
        ''', (project_id,))
        
        conn.commit()
        cur.close()
        database.return_db_connection(conn)
        
        logger.info(f"Project {project_id} settings reset to defaults")
        
        return APIResponse.success(
            data={'project_id': project_id},
            message='Project settings reset to defaults'
        )
    
    except Exception as e:
        logger.exception(f"Error resetting project settings: {e}")
        return APIResponse.error(str(e), ErrorCodes.INTERNAL_SERVER_ERROR), 500