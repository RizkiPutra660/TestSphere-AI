from flask import Blueprint, request, jsonify, Response
from flask_jwt_extended import get_jwt_identity, jwt_required
import data.database as database
import data.test_execution as test_execution
from utils.junit_xml import generate_junit_xml
from utils.logger import setup_logger
import re

logger = setup_logger(__name__)

# Helper functions for parsing pytest output
def parse_pytest_output(output, docker_data):
    """Parse pytest output to extract individual test results."""
    tests = []
    lines = output.split('\n')
    
    for line in lines:
        match = re.search(r'(?:test\.py|test_\w+\.py)::(?:\w+::)?(test_\w+)\s+(PASSED|FAILED|ERROR)', line, re.IGNORECASE)
        
        if not match:
            match = re.search(r'(test_\w+)\s+(PASSED|FAILED|ERROR)', line, re.IGNORECASE)
        
        if match:
            name = match.group(1)
            status = match.group(2)
            tests.append({
                'name': name,
                'status': 'passed' if status.upper() == 'PASSED' else 'failed',
                'duration': 0,
                'description': name.replace('test_', '').replace('_', ' '),
                'error': 'See output for details' if status.upper() in ('FAILED', 'ERROR') else None
            })
    
    # Fallback: extract from summary line "5 passed, 2 failed in 0.23s"
    if not tests:
        summary_match = re.search(r'(\d+)\s+passed(?:,\s*(\d+)\s+failed)?', output, re.IGNORECASE)
        if summary_match:
            passed_count = int(summary_match.group(1) or '0')
            failed_count = int(summary_match.group(2) or '0')
            for i in range(passed_count):
                tests.append({'name': f'test_case_{i+1}', 'status': 'passed', 'duration': 0, 'description': f'Test case {i+1}', 'error': None})
            for i in range(failed_count):
                tests.append({'name': f'test_case_{passed_count+i+1}', 'status': 'failed', 'duration': 0, 'description': f'Test case {passed_count+i+1}', 'error': 'See output for details'})
    
    # Final fallback
    if not tests:
        success = docker_data.get('exit_code', 1) == 0
        tests.append({'name': 'test_execution', 'status': 'passed' if success else 'failed', 'duration': 0, 'description': 'Test execution', 'error': None if success else 'Check raw output'})
    
    return tests


def get_test_scenarios_for_request(request_id):
    """Get original test scenarios from database."""
    try:
        conn = database.get_db_connection()
        cur = conn.cursor()
        cur.execute('''
            SELECT scenario_title, scenario_description, scenario_category, scenario_code
            FROM test_scenarios WHERE ai_request_id = %s AND enabled = TRUE ORDER BY sort_order
        ''', (request_id,))
        scenarios = [{'title': row[0], 'description': row[1], 'category': row[2], 'code': row[3]} for row in cur.fetchall()]
        cur.close()

        database.return_db_connection(conn)
        return scenarios
    except:
        return []


def match_test_to_scenario(test_name, scenarios):
    """Match a test name to an original scenario."""
    if not scenarios:
        return None
    normalized_test = test_name.lower().replace('test_', '').replace('_', ' ')
    for scenario in scenarios:
        normalized_title = scenario['title'].lower().replace('_', ' ').replace('-', ' ')
        if normalized_test in normalized_title or normalized_title in normalized_test:
            return scenario
    return None


def extract_execution_time_ms(output):
    """Extract execution time from pytest output in milliseconds."""
    match = re.search(r'in\s+([\d.]+)s', output)
    return int(float(match.group(1)) * 1000) if match else 0

tests_bp = Blueprint('tests', __name__, url_prefix='/api')

@tests_bp.route('/dashboard/<int:user_id>/recent-runs', methods=['GET'])
def get_recent_runs(user_id):
    project_id = request.args.get('project_id')  # Optional filter
    
    conn = database.get_db_connection()
    cur = conn.cursor()
    
    query = '''
        SELECT 
            ar.id,
            ar.request_text,
            (gt.test_code::jsonb)->>'language' as language,
            el.created_at,
            el.passed_count,
            el.failed_count,
            el.execution_status,
            ar.function_name
        FROM execution_logs el
        JOIN generated_tests gt ON el.ai_request_id = gt.ai_request_id
        JOIN ai_requests ar ON gt.ai_request_id = ar.id
        JOIN projects p ON ar.project_id = p.id
        WHERE p.user_id = %s
    '''
    
    params = [user_id]
    
    if project_id:
        query += ' AND ar.project_id = %s'
        params.append(project_id)
    
    query += ' ORDER BY el.created_at DESC LIMIT 5'
    
    cur.execute(query, params)
    results = cur.fetchall()
    
    recent_runs = []
    for row in results:
        # Use saved function_name if available, otherwise extract from code
        saved_function_name = row[7]
        function_name = saved_function_name if saved_function_name else test_execution.extract_function_name(row[1])
        
        recent_runs.append({
            'id': row[0],
            'functionName': function_name,
            'language': row[2] or 'python',
            'timestamp': row[3].isoformat() if row[3] else None,
            'passedCount': row[4] or 0,
            'failedCount': row[5] or 0,
            'status': row[6]
        })
    
    cur.close()

    
    database.return_db_connection(conn)
    
    return jsonify(recent_runs)

@tests_bp.route('/dashboard/<int:user_id>', methods=['GET'])
def get_dashboard(user_id):
    """Main dashboard endpoint - returns all dashboard data"""
    # Get optional project filter from query params
    project_id = request.args.get('project', type=int)

    try:
        conn = database.get_db_connection()
        cur = conn.cursor()
        
        # 1. Get Projects
        cur.execute('''
            SELECT id, name, description, created_at
            FROM projects
            WHERE user_id = %s
            ORDER BY created_at DESC
        ''', (user_id,))
        
        projects = []
        for row in cur.fetchall():
            projects.append({
                'id': row[0],
                'name': row[1],
                'description': row[2],
                'created_at': row[3].isoformat() if row[3] else None
            })
        
        # 2. Get Recent Requests with function names - sorted by most recent execution
        recent_requests_query = '''
            SELECT 
                ar.id,
                ar.request_text,
                language,
                created_at,
                passed_count,
                failed_count,
                execution_status,
                project_name,
                project_id,
                function_name,
                execution_log_id,
                total_execution_time_ms
            FROM (
                SELECT 
                    ar.id,
                    ar.request_text,
                    ar.function_name,
                    (gt.test_code::jsonb)->>'language' as language,
                    el.created_at,
                    el.passed_count,
                    el.failed_count,
                    el.execution_status,
                    p.name as project_name,
                    p.id as project_id,
                    el.id as execution_log_id,
                    el.total_execution_time_ms,
                    ROW_NUMBER() OVER (PARTITION BY ar.id ORDER BY el.created_at DESC) as rn
                FROM execution_logs el
                JOIN generated_tests gt ON el.ai_request_id = gt.ai_request_id
                JOIN ai_requests ar ON gt.ai_request_id = ar.id
                JOIN projects p ON ar.project_id = p.id
                WHERE p.user_id = %s
        '''
        
        params = [user_id]
        
        # Add project filter if provided
        if project_id:
            recent_requests_query += ' AND p.id = %s'
            params.append(project_id)
        
        recent_requests_query += '''
            ) ar
            WHERE rn = 1
            ORDER BY created_at DESC
            LIMIT 5
        '''
        
        cur.execute(recent_requests_query, tuple(params))
        
        recent_requests = []
        for row in cur.fetchall():
            # Use saved function_name if available, otherwise extract from code
            saved_function_name = row[9]
            function_name = saved_function_name if saved_function_name else test_execution.extract_function_name(row[1])
            recent_requests.append({
                'id': row[0],
                'functionName': function_name,
                'language': row[2] or 'python',
                'timestamp': row[3].isoformat() if row[3] else None,
                'passedCount': row[4] or 0,
                'failedCount': row[5] or 0,
                'status': row[6],
                'projectName': row[7],
                'projectId': row[8],
                'totalTests': (row[4] or 0) + (row[5] or 0),
                'requestText': row[1][:50],  # For compatibility
                'modelUsed': 'gemini-2.5-flash',  # For compatibility
                'executionLogId': row[10],  # NEW: for navigating to results
                'executionTime': row[11] or 0  # NEW: execution time in ms
            })
        
        # 3. Get Stats
        stats_query = '''
            SELECT 
                COUNT(DISTINCT p.id) as total_projects,
                COUNT(DISTINCT ar.id) as total_requests,
                COALESCE(SUM(el.passed_count), 0) as total_passed,
                COALESCE(SUM(el.failed_count), 0) as total_failed,
                COALESCE(SUM(el.passed_count + el.failed_count), 0) as total_tests,
                COUNT(DISTINCT (gt.test_code::jsonb)->>'language') as languages_used
            FROM projects p
            LEFT JOIN ai_requests ar ON p.id = ar.project_id
            LEFT JOIN generated_tests gt ON ar.id = gt.ai_request_id
            LEFT JOIN execution_logs el ON ar.id = el.ai_request_id
            WHERE p.user_id = %s
        '''
        
        stats_params = [user_id]
        
        # Add project filter if provided
        if project_id:
            stats_query += ' AND p.id = %s'
            stats_params.append(project_id)
        
        cur.execute(stats_query, tuple(stats_params))
        
        stats_row = cur.fetchone()
        stats = {
            'totalProjects': stats_row[0] or 0,
            'totalRequests': stats_row[1] or 0,
            'totalPassed': stats_row[2] or 0,
            'totalFailed': stats_row[3] or 0,
            'totalTests': stats_row[4] or 0,
            'languagesUsed': stats_row[5] or 0
        }
        
        # 4. Get Activity (last 7 days) - Use subquery to avoid duplicate counting
        activity_query = '''
            SELECT 
                DATE(el.created_at) as date,
                COALESCE(SUM(el.passed_count), 0) as passed,
                COALESCE(SUM(el.failed_count), 0) as failed
            FROM (
                SELECT DISTINCT ON (el.id)
                    el.id,
                    el.created_at,
                    el.passed_count,
                    el.failed_count
                FROM execution_logs el
                JOIN ai_requests ar ON el.ai_request_id = ar.id
                JOIN projects p ON ar.project_id = p.id
                WHERE p.user_id = %s
                  AND el.created_at >= CURRENT_DATE - INTERVAL '7 days'
        '''
        
        activity_params = [user_id]
        
        # Add project filter if provided
        if project_id:
            activity_query += ' AND p.id = %s'
            activity_params.append(project_id)
        
        activity_query += '''
            ) el
            GROUP BY DATE(el.created_at)
            ORDER BY date DESC
        '''
        
        cur.execute(activity_query, tuple(activity_params))
        
        activity = []
        for row in cur.fetchall():
            activity.append({
                'date': row[0].isoformat() if row[0] else None,
                'passed': row[1],
                'failed': row[2]
            })
        
        cur.close()

        
        database.return_db_connection(conn)

        return jsonify({
            'projects': projects,
            'recentRequests': recent_requests,
            'stats': stats,
            'activity': activity
        })
        
    except Exception as e:
        logger.exception(f"Error in get_dashboard_data: {str(e)}")
        return jsonify({'error': str(e)}), 500

@tests_bp.route('/history/<int:user_id>', methods=['GET'])
def get_test_history(user_id):
    """Get all test history for a user - with pagination support"""
    
    # Get query parameters
    project_id = request.args.get('project', type=int)
    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 20, type=int)
    offset = (page - 1) * per_page
    
    # Search and filter parameters
    search_query = request.args.get('search', '').strip()
    filter_project = request.args.get('filter_project', '').strip()
    filter_language = request.args.get('filter_language', '').strip()
    date_from = request.args.get('date_from', '').strip()
    date_to = request.args.get('date_to', '').strip()
    filter_test_type = request.args.get('filter_test_type', '').strip()
    
    try:
        conn = database.get_db_connection()
        cur = conn.cursor()
        
# Build base query for all test executions - NO JOIN with generated_tests
        history_query = '''
            SELECT 
                ar.id,
                ar.request_text,
                ar.function_name,
                (SELECT (test_code::jsonb)->>'language' FROM generated_tests WHERE ai_request_id = ar.id LIMIT 1) as language,
                el.created_at,
                el.passed_count,
                el.failed_count,
                el.execution_status,
                p.name as project_name,
                p.id as project_id,
                el.id as execution_log_id,
                el.total_execution_time_ms,
                el.total_tests,
                COALESCE(el.test_type, 'unit') as test_type
            FROM execution_logs el
            JOIN ai_requests ar ON el.ai_request_id = ar.id
            JOIN projects p ON ar.project_id = p.id
            WHERE p.user_id = %s
        '''
        
        params = [user_id]
        count_params = [user_id]
        
        # Add project filter if specific project selected
        if project_id:
            history_query += ' AND p.id = %s'
            params.append(project_id)
            count_params.append(project_id)
        
        # Add search filter
        if search_query:
            search_param = f'%{search_query}%'
            if project_id:
                history_query += ' AND (ar.function_name ILIKE %s OR ar.request_text ILIKE %s)'
                params.extend([search_param, search_param])
                count_params.extend([search_param, search_param])
            else:
                history_query += ' AND (ar.function_name ILIKE %s OR ar.request_text ILIKE %s OR p.name ILIKE %s)'
                params.extend([search_param, search_param, search_param])
                count_params.extend([search_param, search_param, search_param])
        
        # Add project name filter (only for all projects view)
        if filter_project and not project_id:
            history_query += ' AND p.name = %s'
            params.append(filter_project)
            count_params.append(filter_project)
        
        # Add language filter
        if filter_language:
            history_query += " AND (SELECT (test_code::jsonb)->>'language' FROM generated_tests WHERE ai_request_id = ar.id LIMIT 1) ILIKE %s"
            params.append(filter_language)
            count_params.append(filter_language)
        
        # Add date range filters
        if date_from:
            history_query += ' AND DATE(el.created_at) >= %s'
            params.append(date_from)
            count_params.append(date_from)
        
        if date_to:
            history_query += ' AND DATE(el.created_at) <= %s'
            params.append(date_to)
            count_params.append(date_to)
        
        # Add test type filter
        if filter_test_type:
            if filter_test_type == 'unit':
                history_query += " AND (el.test_type IS NULL OR el.test_type = 'unit')"
            elif filter_test_type == 'integration':
                history_query += " AND el.test_type = 'integration'"
        
        # Build count query with same filters (NO JOIN with generated_tests)
        count_query = '''
            SELECT COUNT(*)
            FROM execution_logs el
            JOIN ai_requests ar ON el.ai_request_id = ar.id
            JOIN projects p ON ar.project_id = p.id
            WHERE p.user_id = %s
        '''
        
        # Add same filters to count query
        if project_id:
            count_query += ' AND p.id = %s'
        
        if search_query:
            if project_id:
                count_query += ' AND (ar.function_name ILIKE %s OR ar.request_text ILIKE %s)'
            else:
                count_query += ' AND (ar.function_name ILIKE %s OR ar.request_text ILIKE %s OR p.name ILIKE %s)'
        
        if filter_project and not project_id:
            count_query += ' AND p.name = %s'
        
        if filter_language:
            count_query += " AND (SELECT (test_code::jsonb)->>'language' FROM generated_tests WHERE ai_request_id = ar.id LIMIT 1) ILIKE %s"
        
        if date_from:
            count_query += ' AND DATE(el.created_at) >= %s'
        
        if date_to:
            count_query += ' AND DATE(el.created_at) <= %s'
        
        if filter_test_type:
            if filter_test_type == 'unit':
                count_query += " AND (el.test_type IS NULL OR el.test_type = 'unit')"
            elif filter_test_type == 'integration':
                count_query += " AND el.test_type = 'integration'"
        
        cur.execute(count_query, tuple(count_params))
        total_count = cur.fetchone()[0]
        
        # Add ordering and pagination
        history_query += '''
            ORDER BY el.created_at DESC
            LIMIT %s OFFSET %s
        '''
        params.extend([per_page, offset])
        
        cur.execute(history_query, tuple(params))
        
        history = []
        for row in cur.fetchall():
            saved_function_name = row[2]
            function_name = saved_function_name if saved_function_name else test_execution.extract_function_name(row[1])
            
            history.append({
                'id': row[0],
                'functionName': function_name,
                'requestText': row[1][:100] if row[1] else '',
                'language': row[3] or 'python',
                'timestamp': row[4].isoformat() if row[4] else None,
                'passedCount': row[5] or 0,
                'failedCount': row[6] or 0,
                'status': row[7],
                'projectName': row[8],
                'projectId': row[9],
                'executionLogId': row[10],
                'executionTime': row[11] or 0,
                'totalTests': row[12] or 0,
                'testType': row[13] or 'unit'
            })
        
        # Get project name for specific project view
        project_name = None
        if project_id:
            cur.execute('SELECT name FROM projects WHERE id = %s', (project_id,))
            project_row = cur.fetchone()
            if project_row:
                project_name = project_row[0]
        
        # Get available filters (unique projects and languages for this user)
        cur.execute('''
            SELECT DISTINCT p.name
            FROM projects p
            JOIN ai_requests ar ON p.id = ar.project_id
            JOIN execution_logs el ON ar.id = el.ai_request_id
            WHERE p.user_id = %s
            ORDER BY p.name
        ''', (user_id,))
        available_projects = [row[0] for row in cur.fetchall()]
        
        cur.execute('''
            SELECT DISTINCT (gt.test_code::jsonb)->>'language' as language
            FROM generated_tests gt
            JOIN ai_requests ar ON gt.ai_request_id = ar.id
            JOIN projects p ON ar.project_id = p.id
            WHERE p.user_id = %s AND (gt.test_code::jsonb)->>'language' IS NOT NULL
            ORDER BY language
        ''', (user_id,))
        available_languages = [row[0] for row in cur.fetchall()]
        
        cur.close()

        
        database.return_db_connection(conn)
        
        response_data = {
            'history': history,
            'pagination': {
                'page': page,
                'perPage': per_page,
                'total': total_count,
                'totalPages': (total_count + per_page - 1) // per_page
            },
            'availableFilters': {
                'projects': available_projects,
                'languages': available_languages
            }
        }
        
        # Add project name for specific project view
        if project_name:
            response_data['projectName'] = project_name
        
        return jsonify(response_data)
        
    except Exception as e:
        logger.exception("Error in get_test_history")
        return jsonify({'error': str(e)}), 500


@tests_bp.route('/results/<int:execution_log_id>', methods=['GET'])
def get_execution_results(execution_log_id):
    """Get detailed results for a specific execution."""
    try:
        conn = database.get_db_connection()
        cur = conn.cursor()
        
        cur.execute('''
            SELECT 
                el.id,
                el.ai_request_id,
                el.total_tests,
                el.passed_count,
                el.failed_count,
                el.total_execution_time_ms,
                el.execution_status,
                el.execution_output,
                el.created_at,
                ar.request_text,
                (gt.test_code::jsonb)->>'language' as language,
                p.name as project_name,
                ar.function_name,
                gt.test_code,
                tsm.framework,
                tsm.generated_with_config
            FROM execution_logs el
            JOIN ai_requests ar ON el.ai_request_id = ar.id
            LEFT JOIN generated_tests gt ON ar.id = gt.ai_request_id
            LEFT JOIN projects p ON ar.project_id = p.id
            LEFT JOIN test_suite_metadata tsm ON ar.id = tsm.ai_request_id
            WHERE el.id = %s
        ''', (execution_log_id,))
        
        row = cur.fetchone()
        
        if not row:
            return jsonify({'error': 'Execution log not found'}), 404
        
        # Get function name - use saved or extract from code
        saved_function_name = row[12]
        function_name = saved_function_name if saved_function_name else test_execution.extract_function_name(row[9] or '')
        
        # Get framework and config from test_suite_metadata
        framework = row[14] if row[14] else None
        generated_with_config = row[15] if row[15] else None
        
        execution_log = {
            'id': row[0],
            'ai_request_id': row[1],
            'total_tests': row[2],
            'passed_count': row[3],
            'failed_count': row[4],
            'total_execution_time_ms': row[5],
            'execution_status': row[6],
            'execution_output': row[7],
            'created_at': row[8].isoformat() if row[8] else None,
            'request_text': row[9],
            'language': row[10],
            'project_name': row[11],
            'function_name': function_name,
            'framework': framework,
            'config': generated_with_config
        }
        
        # Parse test_code JSON to get individual test cases with their code
        test_code_json = row[13]
        test_cases_from_generated = {}
        if test_code_json:
            import json
            try:
                test_data = json.loads(test_code_json) if isinstance(test_code_json, str) else test_code_json
                for tc in test_data.get('testCases', []):
                    # Create a key from the title for matching
                    test_cases_from_generated[tc.get('title', '')] = {
                        'code': tc.get('code', ''),
                        'description': tc.get('description', ''),
                        'category': tc.get('category', '')
                    }
            except:
                pass
                # Fetch original test scenarios from test_scenarios table
        ai_request_id = row[1]
        original_test_cases = []
        if ai_request_id:
            cur.execute('''
                SELECT 
                    scenario_title,
                    scenario_description,
                    scenario_code,
                    scenario_category,
                    sort_order
                FROM test_scenarios
                WHERE ai_request_id = %s
                ORDER BY sort_order
            ''', (ai_request_id,))
            
            scenario_rows = cur.fetchall()
            original_test_cases = [
                {
                    'title': s_row[0],
                    'description': s_row[1],
                    'code': s_row[2],
                    'category': s_row[3]
                }
                for s_row in scenario_rows
            ]
        cur.close()

        database.return_db_connection(conn)
        
        test_results = test_execution.get_test_execution_results(execution_log_id)
        
        # Enhance test_results with code from generated_tests
        for result in test_results:
            # Try to match by test case name
            test_name = result.get('test_case_name', '')
            for title, tc_data in test_cases_from_generated.items():
                # Match by converting title to test_name format
                title_as_test_name = 'test_' + title.lower().replace(' ', '_').replace('-', '_')
                if test_name == title_as_test_name or test_name in title.lower().replace(' ', '_'):
                    result['code'] = tc_data['code']
                    break
        
        return jsonify({
            'execution_log': execution_log,
            'test_results': test_results,
            'original_test_cases': original_test_cases
        })
        
    except Exception as e:
        logger.exception(f"Error getting execution results: {e}")
        return jsonify({'error': str(e)}), 500


@tests_bp.route('/results/<int:execution_log_id>/junit', methods=['GET'])
def get_junit_xml(execution_log_id):
    """
    Get test results as JUnit XML format.
    
    This endpoint is CI/CD friendly - works with:
    - GitHub Actions
    - GitLab CI
    - Jenkins
    - Azure DevOps
    - CircleCI
    """
    try:
        conn = database.get_db_connection()
        cur = conn.cursor()
        
        cur.execute('''
            SELECT 
                el.id,
                el.ai_request_id,
                el.total_tests,
                el.passed_count,
                el.failed_count,
                el.total_execution_time_ms,
                el.execution_status,
                el.execution_output,
                el.created_at,
                ar.request_text,
                p.name as project_name
            FROM execution_logs el
            JOIN ai_requests ar ON el.ai_request_id = ar.id
            LEFT JOIN projects p ON ar.project_id = p.id
            WHERE el.id = %s
        ''', (execution_log_id,))
        
        row = cur.fetchone()
        
        if not row:
            return jsonify({'error': 'Execution log not found'}), 404
        
        execution_log = {
            'id': row[0],
            'ai_request_id': row[1],
            'total_tests': row[2],
            'passed_count': row[3],
            'failed_count': row[4],
            'total_execution_time_ms': row[5],
            'execution_status': row[6],
            'execution_output': row[7],
            'created_at': row[8],
            'request_text': row[9],
            'project_name': row[10]
        }
        
        cur.close()

        
        database.return_db_connection(conn)
        
        test_results = test_execution.get_test_execution_results(execution_log_id)
        
        testsuite_name = request.args.get('name')
        if not testsuite_name and execution_log.get('project_name'):
            testsuite_name = f"{execution_log['project_name']}-Execution-{execution_log_id}"
        
        junit_xml = generate_junit_xml(
            execution_log=execution_log,
            test_results=test_results,
            testsuite_name=testsuite_name
        )
        
        response = Response(junit_xml, mimetype='application/xml')
        
        if request.args.get('download', '').lower() == 'true':
            filename = f"test-results-{execution_log_id}.xml"
            response.headers['Content-Disposition'] = f'attachment; filename="{filename}"'
        
        return response
        
    except Exception as e:
        logger.exception(f"Error generating JUnit XML: {e}")
        return jsonify({'error': str(e)}), 500


@tests_bp.route('/results/latest/junit', methods=['GET'])
def get_latest_junit_xml():
    """Get JUnit XML for the most recent execution."""
    try:
        ai_request_id = request.args.get('ai_request_id', type=int)
        
        conn = database.get_db_connection()
        cur = conn.cursor()
        
        if ai_request_id:
            cur.execute('''
                SELECT id FROM execution_logs 
                WHERE ai_request_id = %s 
                ORDER BY created_at DESC 
                LIMIT 1
            ''', (ai_request_id,))
        else:
            cur.execute('''
                SELECT id FROM execution_logs 
                ORDER BY created_at DESC 
                LIMIT 1
            ''')
        
        row = cur.fetchone()
        cur.close()

        database.return_db_connection(conn)
        
        if not row:
            return jsonify({'error': 'No executions found'}), 404
        
        return get_junit_xml(row[0])
        
    except Exception as e:
        logger.exception(f"Error getting latest JUnit XML: {e}")
        return jsonify({'error': str(e)}), 500


@tests_bp.route('/results/<int:execution_log_id>', methods=['DELETE'])
def delete_execution(execution_log_id):
    """Delete a test execution and its related results."""
    try:
        conn = database.get_db_connection()
        cur = conn.cursor()
        
        # First verify the execution exists and get ai_request_id
        cur.execute('SELECT ai_request_id FROM execution_logs WHERE id = %s', (execution_log_id,))
        row = cur.fetchone()
        if not row:
            cur.close()

            database.return_db_connection(conn)
            return jsonify({'error': 'Execution not found'}), 404
        
        # Delete test execution results first (foreign key constraint)
        cur.execute('DELETE FROM test_case_results WHERE execution_log_id = %s', (execution_log_id,))
        
        # Delete the execution log
        cur.execute('DELETE FROM execution_logs WHERE id = %s', (execution_log_id,))
        
        conn.commit()
        cur.close()

        database.return_db_connection(conn)
        
        return jsonify({'message': 'Execution deleted successfully'}), 200
        
    except Exception as e:
        logger.exception(f"Error deleting execution: {e}")
        return jsonify({'error': str(e)}), 500

#======================================================================
# Docker Execution
#====================================================================== 
from routes.auth_routes import token_required
from utils.docker_executor import execute_tests_in_docker, ExecutionMode
from utils.local_secrets_provider import secrets_provider
import logging
logger = logging.getLogger(__name__)
@tests_bp.route('/execute-tests', methods=['POST'])
@token_required
def execute_tests():
    """
    Execute tests in Docker with optional secrets injection.
    
    This is DIFFERENT from AI simulation in /run-tests.
    This actually runs code in Docker containers.
    
    Request body:
    {
        "test_code": "...",
        "source_code": "...",
        "language": "python",
        "project_id": 1,
        "config": {
            "mode": "integration",  // or "unit"
            "secrets": ["DATABASE_URL", "API_KEY"]
        }
    }
    """
    data = request.json
    
    # Debug logging
    logger.debug("execute-tests request received")
    logger.debug("test_code: %s", "present" if data.get('test_code') else "missing")
    logger.debug("source_code: %s", "present" if data.get('source_code') else "missing")
    logger.debug("language: %s", data.get('language', 'not specified'))
    logger.debug("config: %s", data.get('config', {}))
    
    test_code = data.get('test_code')
    source_code = data.get('source_code')
    language = data.get('language', 'python')
    project_id = data.get('project_id')
    config = data.get('config', {})
    request_id = data.get('request_id')  # NEW: Get request_id for database save
    function_name = data.get('function_name', 'Integration Test')  # NEW
    requirements = data.get('requirements')  # US-1: Python requirements.txt
    custom_deps = data.get('custom_deps')    # US-1: Java custom dependencies

    # Back-compat: older frontend sends deps inside config.requirements
    if (not custom_deps) and language.lower() == "java":
        custom_deps = config.get("custom_deps") or config.get("dependencies") or config.get("requirements")

    if (not requirements) and language.lower() == "python":
        requirements = config.get("requirements")


    
    # Validation
    if not test_code:
        logger.error("❌ Validation failed: test_code is required")
        return jsonify({'error': 'test_code is required'}), 400
    if not source_code:
        logger.error("❌ Validation failed: source_code is required")
        return jsonify({'error': 'source_code is required'}), 400
    
    # Determine execution mode
    mode_str = config.get('mode', 'unit').lower()
    execution_mode = (ExecutionMode.INTEGRATION 
                     if mode_str == 'integration' 
                     else ExecutionMode.UNIT)
    
    # Retrieve secrets (BEFORE passing to executor)
    env_vars = {}
    allowed_secrets = config.get('secrets', [])
    
    if allowed_secrets:
        if not project_id:
            return jsonify({
                'error': 'project_id required when secrets are specified'
            }), 400
        
        # CRITICAL: Fail fast if secrets requested but not available
        try:
            env_vars = secrets_provider.get_for_execution(
                project_id=project_id,
                allowed_keys=allowed_secrets
            )
            
            # Check if all requested secrets were retrieved
            missing = set(allowed_secrets) - set(env_vars.keys())
            if missing:
                return jsonify({
                    'error': f'Required secrets not found: {list(missing)}'
                }), 400
                
        except Exception as e:
            logger.error(f"Failed to retrieve secrets: {e}")
            return jsonify({
                'error': 'Failed to retrieve required secrets'
            }), 500
    
    # Rebuild test code from database if request_id is provided
    if request_id and language == 'java':
        logger.debug("Rebuilding Java test class from database for request_id: %s", request_id)
        try:
            from utils.java_test_builder import JavaTestClassBuilder
            import data.database as db
            
            # Fetch metadata and scenarios from database
            with db.get_db_connection() as conn:
                with conn.cursor() as cur:
                    # Get metadata
                    cur.execute('''
                        SELECT imports, setup_code, teardown_code, language
                        FROM test_suite_metadata
                        WHERE ai_request_id = %s
                    ''', (request_id,))
                    meta_row = cur.fetchone()
                    
                    if not meta_row:
                        logger.error(f"No metadata found for request_id: {request_id}")
                    else:
                        imports_str, setup_code, teardown_code, lang = meta_row
                        
                        # Get enabled scenarios
                        cur.execute('''
                            SELECT scenario_title, scenario_code, sort_order
                            FROM test_scenarios
                            WHERE ai_request_id = %s AND enabled = TRUE
                            ORDER BY sort_order
                        ''', (request_id,))
                        scenario_rows = cur.fetchall()
                        
                        if scenario_rows:
                            # Get metadata from generated_tests (contains full JSON with annotations)
                            cur.execute('''
                                SELECT test_code 
                                FROM generated_tests 
                                WHERE ai_request_id = %s
                            ''', (request_id,))
                            gt_row = cur.fetchone()
                            
                            if gt_row:
                                import json
                                gt_data = json.loads(gt_row[0])
                                
                                # Parse imports (could be string or list)
                                # gt_data['imports'] should be a list from ai_routes
                                raw_imports = gt_data.get('imports', [])
                                if isinstance(raw_imports, str):
                                    imports_list = [imp.strip() for imp in raw_imports.split('\n') if imp.strip()]
                                else:
                                    imports_list = raw_imports

                                # Build Java metadata dynamically
                                java_metadata = {
                                    'package_name': gt_data.get('package_name', 'com.test'),
                                    'class_name': gt_data.get('class_name', 'ApplicationTest'),
                                    'imports': imports_list,
                                    'class_annotations': gt_data.get('class_annotations', []),
                                    'fields': gt_data.get('fields', []),
                                    'setup_code': gt_data.get('setup_code', ''),
                                    'teardown_code': gt_data.get('teardown_code', '')
                                }
                            else:
                                # Fallback if generated_tests missing (should result in basic JUnit)
                                java_metadata = {
                                    'package_name': 'com.test',
                                    'class_name': 'ApplicationTest',
                                    'imports': imports_list if 'imports_list' in locals() else [],
                                    'class_annotations': [], 
                                    'fields': [],
                                    'setup_code': setup_code or '',
                                    'teardown_code': teardown_code or ''
                                }
                                
                            # Convert scenarios to Java format
                            java_scenarios = [
                                {
                                    'title': row[0] or f'test{row[2]}',
                                    'test_code': row[1],
                                    'annotations': ['@Test'],
                                    'throws': ['Exception']
                                }
                                for row in scenario_rows
                            ]
                            
                            # Build complete Java test class
                            test_code = JavaTestClassBuilder.build_test_class(java_metadata, java_scenarios)
                            logger.debug("Rebuilt Java test class: %s chars", len(test_code))
                        else:
                            logger.warning(f"No enabled scenarios found for request_id: {request_id}")
        except Exception as e:
            logger.error(f"Failed to rebuild Java test class: {e}")
            import traceback
            traceback.print_exc()
    
    # Execute with pre-resolved secrets
    try:
        result = execute_tests_in_docker(
            test_code=test_code,
            source_code=source_code,
            language=language,
            env_vars=env_vars,  # Already decrypted and validated
            execution_mode=execution_mode,
            config=config,  # Pass config for executor image selection
            project_id=project_id,
            requirements=requirements,
            custom_deps=custom_deps
        )
        
        # Log output for debugging
        logger.debug("Docker execution completed")
        logger.debug("Exit code: %s", result['exit_code'])
        logger.debug("Success: %s", result['success'])
        logger.debug("Output length: %s", len(result.get('output', '')))
        logger.debug("Output preview: %s", result.get('output', '')[:500])
        if result.get('errors'):
            logger.warning(f"  Errors: {result['errors'][:500]}")
       
        # Save execution results to database
        execution_log_id = None
        if request_id:
            try:
                # Parse individual test results from pytest output, OR use structured JSON if available
                if result.get('test_results_json'):
                    ts = result['test_results_json']

                    # Rich per-test data (JavaScript path returns a `tests` array)
                    if ts.get('tests'):
                        parsed_tests = [
                            {
                                'name': t.get('name', 'unknown'),
                                'status': t.get('status', 'failed'),
                                'description': t.get('description') or t.get('name', 'unknown'),
                                'duration': t.get('duration', 0),
                                'error': t.get('error'),
                            }
                            for t in ts['tests']
                        ]
                    else:
                        # Legacy path (Java / Surefire): reconstruct from summary + failures list
                        parsed_tests = []
                        for msg in ts['failures']:
                            parts = msg.split(':', 1)
                            name = parts[0]
                            error = parts[1] if len(parts) > 1 else "Unknown Error"
                            parsed_tests.append({
                                'name': name,
                                'status': 'failed',
                                'description': 'Java Test Case',
                                'duration': 0,
                                'error': error.strip()
                            })
                        for i in range(ts['passed']):
                            parsed_tests.append({
                                'name': f"Test_{i+1}",
                                'status': 'passed',
                                'description': 'Java Test Case',
                                'duration': 0,
                                'error': None
                            })
                else:
                    output = result.get('output', '')
                    parsed_tests = parse_pytest_output(output, result)
                
                passed_count = len([t for t in parsed_tests if t['status'] == 'passed'])
                failed_count = len([t for t in parsed_tests if t['status'] == 'failed'])
                total_tests = len(parsed_tests)
                
                # Create execution log
                execution_log_id = test_execution.create_execution_log(request_id, total_tests, mode_str)
                
                # Get original test scenarios from database
                original_scenarios = get_test_scenarios_for_request(request_id)
                
                # Save individual test results
                for test in parsed_tests:
                    matched_scenario = match_test_to_scenario(test['name'], original_scenarios)
                    test_execution.save_test_case_result(
                        execution_log_id=execution_log_id,
                        test_case_name=test['name'],
                        test_case_category=matched_scenario.get('category', 'Integration Test') if matched_scenario else 'Integration Test',
                        test_case_description=matched_scenario.get('description', test['description']) if matched_scenario else test['description'],
                        status=test['status'],
                        execution_time_ms=test.get('duration', 0),
                        error_message=test.get('error'),
                        stack_trace=None
                    )
                
                # Update summary
                overall_status = 'passed' if result['success'] else 'failed'
                test_execution.update_execution_log_summary(
                    execution_log_id,
                    passed_count,
                    failed_count,
                    extract_execution_time_ms(result.get('output', '')),
                    overall_status,
                    f"{passed_count}/{total_tests} tests passed"
                )
                
                logger.debug(
                    "Saved execution to database: execution_log_id=%s, %s test results",
                    execution_log_id,
                    len(parsed_tests),
                )
            except Exception as db_error:
                logger.error(f"❌ Failed to save execution to database: {db_error}")
        
        return jsonify({
            'success': result['success'],
            'exit_code': result['exit_code'],
            'output': result['output'],
            'errors': result['errors'],
            'xml_reports': result.get('xml_reports'),
            'test_results_json': result.get('test_results_json')
        }), 200
        
    except Exception as e:
        logger.error(f"Execution failed: {e}")
        return jsonify({'error': str(e)}), 500        


# ============================================================================
# TEST SCENARIOS ROUTES
# ============================================================================

@tests_bp.route('/test-scenarios/<int:scenario_id>', methods=['PATCH'])
@jwt_required()
def update_scenario(scenario_id):
    """Update an existing test scenario"""
    try:
        data = request.get_json()
        
        conn = database.get_db_connection()
        cur = conn.cursor()
        
        # Update scenario in database
        cur.execute('''
            UPDATE test_scenarios
            SET 
                scenario_title = %s,
                scenario_description = %s,
                scenario_category = %s,
                scenario_code = %s,
                is_user_edited = TRUE,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = %s
            RETURNING id
        ''', (
            data.get('title'),
            data.get('description'),
            data.get('category'),
            data.get('code'),
            scenario_id
        ))
        
        result = cur.fetchone()
        if not result:
            return jsonify({'error': 'Scenario not found'}), 404
        
        conn.commit()
        cur.close()

        database.return_db_connection(conn)
        
        return jsonify({
            'message': 'Scenario updated successfully',
            'id': result[0],
            'title': data.get('title'),
            'description': data.get('description'),
            'category': data.get('category'),
            'code': data.get('code')
        }), 200
        
    except Exception as e:
        logger.exception(f"Error updating scenario: {str(e)}")
        return jsonify({' error': str(e)}), 500

@tests_bp.route('/test-scenarios/<int:scenario_id>', methods=['DELETE'])
@jwt_required()
def delete_scenario(scenario_id):
    """
    Soft delete a scenario by setting enabled = FALSE.
    Use ?hard=true query param for permanent deletion.
    """
    try:
        hard_delete = request.args.get('hard', 'false').lower() == 'true'
        
        conn = database.get_db_connection()
        cur = conn.cursor()
        
        if hard_delete:
            # Permanent deletion
            cur.execute('DELETE FROM test_scenarios WHERE id = %s RETURNING id', (scenario_id,))
        else:
            # Soft delete
            cur.execute('''
                UPDATE test_scenarios 
                SET enabled = FALSE, updated_at = CURRENT_TIMESTAMP
                WHERE id = %s
                RETURNING id
            ''', (scenario_id,))
        
        result = cur.fetchone()
        
        if not result:
            return jsonify({'error': 'Scenario not found'}), 404
        
        conn.commit()
        cur.close()

        database.return_db_connection(conn)
        
        return jsonify({
            'message': 'Scenario deleted successfully' if hard_delete else 'Scenario disabled successfully',
            'id': result[0]
        }), 200
        
    except Exception as e:
        logger.exception(f"Error deleting scenario: {str(e)}")
        return jsonify({'error': str(e)}), 500


@tests_bp.route('/test-scenarios/<int:ai_request_id>/rebuild', methods=['GET'])
@jwt_required()
def rebuild_full_code(ai_request_id):
    """Rebuild full test code from enabled scenarios"""
    try:
        from utils.scenario_manager import ScenarioManager
        
        conn = database.get_db_connection()
        cur = conn.cursor()
        
        # Get metadata
        cur.execute('''
            SELECT language, imports, setup_code, teardown_code
            FROM test_suite_metadata
            WHERE ai_request_id = %s
        ''', (ai_request_id,))
        
        metadata_row = cur.fetchone()
        if not metadata_row:
            return jsonify({'error': 'Metadata not found'}), 404
        
        language, imports, setup_code, teardown_code = metadata_row
        
        # Get enabled scenarios
        cur.execute('''
            SELECT scenario_code, sort_order
            FROM test_scenarios
            WHERE ai_request_id = %s AND enabled = TRUE
            ORDER BY sort_order
        ''', (ai_request_id,))
        
        scenarios = [
            {'scenario_code': row[0], 'sort_order': row[1]} 
            for row in cur.fetchall()
        ]
        
        cur.close()

        
        database.return_db_connection(conn)
        
        # Rebuild full code
        full_code = ScenarioManager.rebuild_full_code(
            imports=imports or '',
            setup_code=setup_code or '',
            scenarios=scenarios,
            teardown_code=teardown_code,
            language=language
        )
        
        return jsonify({
            'fullCode': full_code,
            'language': language,
            'scenario_count': len(scenarios)
        }), 200
        
    except Exception as e:
        logger.exception(f"Error rebuilding: {str(e)}")
        return jsonify({'error': str(e)}), 500

@tests_bp.route('/test-scenarios', methods=['POST'])
@jwt_required()
def create_scenario():
    try:
        data = request.get_json()

        ai_request_id = data.get("ai_request_id")
        title = data.get("title")
        description = data.get("description")
        category = data.get("category")
        code = data.get("code")

        if not ai_request_id:
            return jsonify({"error": "ai_request_id is required"}), 400

        conn = database.get_db_connection()
        cur = conn.cursor()

        # Pick next sort_order
        cur.execute("""
            SELECT COALESCE(MAX(sort_order), 0) + 1
            FROM test_scenarios
            WHERE ai_request_id = %s
        """, (ai_request_id,))
        next_sort = cur.fetchone()[0]

        cur.execute("""
            INSERT INTO test_scenarios
              (ai_request_id, scenario_title, scenario_description, scenario_category, scenario_code,
               enabled, is_user_edited, sort_order)
            VALUES (%s, %s, %s, %s, %s, TRUE, TRUE, %s)
            RETURNING id
        """, (ai_request_id, title, description, category, code, next_sort))

        new_id = cur.fetchone()[0]
        conn.commit()
        cur.close()

        database.return_db_connection(conn)

        # return created object (frontend expects this)
        return jsonify({
            "id": new_id,
            "title": title,
            "description": description,
            "category": category,
            "code": code
        }), 201

    except Exception as e:
        logger.exception(f"Error creating scenario: {str(e)}")
        return jsonify({"error": str(e)}), 500


# ============================================================================
# ENHANCED TEST ROUTES - Progress Tracking & Analysis
# ============================================================================

@tests_bp.route('/tests/<int:test_id>/progress', methods=['GET'])
def test_progress_stream(test_id):
    """
    Stream real-time progress updates for a test run (Server-Sent Events).
    
    Usage (JavaScript):
        const eventSource = new EventSource('/api/tests/123/progress');
        eventSource.addEventListener('progress', (e) => {
            const data = JSON.parse(e.data);
            console.log(`Progress: ${data.progress}% - ${data.message}`);
        });
    """
    try:
        from utils.progress_tracker import create_sse_stream
        
        # Verify test exists
        conn = database.get_db_connection()
        cur = conn.cursor()
        cur.execute('SELECT id FROM tests WHERE id = %s', (test_id,))
        if not cur.fetchone():
            cur.close()
            database.return_db_connection(conn)
            from utils.api_response import APIResponse, ErrorCodes
            return APIResponse.error('Test not found', ErrorCodes.NOT_FOUND), 404
        
        cur.close()
        database.return_db_connection(conn)
        
        # Create SSE stream
        return create_sse_stream(test_id)
    
    except Exception as e:
        logger.exception(f"Error creating progress stream: {e}")
        from utils.api_response import APIResponse, ErrorCodes
        return APIResponse.error(str(e), ErrorCodes.INTERNAL_SERVER_ERROR), 500


@tests_bp.route('/tests/<int:test_id>/progress/history', methods=['GET'])
@jwt_required()
def test_progress_history(test_id):
    """Get progress event history for a test."""
    try:
        from utils.progress_tracker import get_progress_history
        from utils.api_response import APIResponse
        
        limit = request.args.get('limit', 50, type=int)
        limit = min(limit, 100)  # Cap at 100
        
        events = get_progress_history(test_id, limit)
        
        return APIResponse.success(
            data={'events': events},
            message=f'Retrieved {len(events)} progress events'
        )
    
    except Exception as e:
        logger.exception(f"Error getting progress history: {e}")
        from utils.api_response import APIResponse, ErrorCodes
        return APIResponse.error(str(e), ErrorCodes.INTERNAL_SERVER_ERROR), 500


@tests_bp.route('/tests/<int:test_id>/cancel', methods=['POST'])
@jwt_required()
def cancel_test(test_id):
    """Cancel a running test execution."""
    try:
        from utils.progress_tracker import ProgressTracker
        from utils.api_response import APIResponse, ErrorCodes
        
        data = request.get_json() or {}
        reason = data.get('reason', 'Cancelled by user')
        
        conn = database.get_db_connection()
        cur = conn.cursor()
        
        # Check test exists and is running
        cur.execute('''
            SELECT id, status, progress_percentage
            FROM tests
            WHERE id = %s
        ''', (test_id,))
        
        test = cur.fetchone()
        if not test:
            cur.close()
            database.return_db_connection(conn)
            return APIResponse.error('Test not found', ErrorCodes.NOT_FOUND), 404
        
        test_status = test[1]
        if test_status not in ['pending', 'running']:
            cur.close()
            database.return_db_connection(conn)
            return APIResponse.error(
                f'Cannot cancel test with status: {test_status}',
                ErrorCodes.BAD_REQUEST
            ), 400
        
        # Mark as cancelled
        cur.execute('''
            UPDATE tests
            SET status = 'cancelled',
                is_cancelled = TRUE,
                cancellation_reason = %s,
                completed_at = CURRENT_TIMESTAMP
            WHERE id = %s
        ''', (reason, test_id))
        
        conn.commit()
        cur.close()
        database.return_db_connection(conn)
        
        # Send cancellation event
        tracker = ProgressTracker(test_id)
        tracker.cancel(reason)
        
        logger.info(f"Test {test_id} cancelled: {reason}")
        
        return APIResponse.success(
            data={'test_id': test_id, 'status': 'cancelled'},
            message='Test execution cancelled'
        )
    
    except Exception as e:
        logger.exception(f"Error cancelling test: {e}")
        from utils.api_response import APIResponse, ErrorCodes
        return APIResponse.error(str(e), ErrorCodes.INTERNAL_SERVER_ERROR), 500


@tests_bp.route('/projects/<int:project_id>/tests/compare', methods=['GET'])
@jwt_required()
def compare_test_runs_endpoint(project_id):
    """Compare test results between two commits."""
    try:
        from utils.test_diffing import compare_test_runs, get_cached_comparison
        from utils.api_response import APIResponse, ErrorCodes
        
        base_commit = request.args.get('base_commit')
        compare_commit = request.args.get('compare_commit')
        
        if not base_commit or not compare_commit:
            return APIResponse.error(
                'base_commit and compare_commit parameters required',
                ErrorCodes.VALIDATION_ERROR
            ), 400
        
        # Check cache first
        cached = get_cached_comparison(project_id, base_commit, compare_commit)
        if cached:
            return APIResponse.success(
                data=cached,
                message='Comparison retrieved from cache'
            )
        
        # Generate new comparison
        diff = compare_test_runs(project_id, base_commit, compare_commit)
        
        if not diff:
            return APIResponse.error(
                'Could not find test runs for specified commits',
                ErrorCodes.NOT_FOUND
            ), 404
        
        return APIResponse.success(
            data=diff.to_dict(),
            message='Test runs compared successfully'
        )
    
    except Exception as e:
        logger.exception(f"Error comparing test runs: {e}")
        from utils.api_response import APIResponse, ErrorCodes
        return APIResponse.error(str(e), ErrorCodes.INTERNAL_SERVER_ERROR), 500


@tests_bp.route('/projects/<int:project_id>/tests/history', methods=['GET'])
@jwt_required()
def get_project_test_history(project_id):
    """Get test run history for a project."""
    try:
        from utils.test_diffing import get_test_run_history
        from utils.api_response import APIResponse
        
        limit = request.args.get('limit', 50, type=int)
        limit = min(limit, 100)
        
        runs = get_test_run_history(project_id, limit)
        
        return APIResponse.success(
            data={
                'project_id': project_id,
                'runs': [run.__dict__ for run in runs]
            },
            message=f'Retrieved {len(runs)} test runs'
        )
    
    except Exception as e:
        logger.exception(f"Error getting test history: {e}")
        from utils.api_response import APIResponse, ErrorCodes
        return APIResponse.error(str(e), ErrorCodes.INTERNAL_SERVER_ERROR), 500


@tests_bp.route('/projects/<int:project_id>/tests/trends', methods=['GET'])
@jwt_required()
def get_trends(project_id):
    """Get test result trends over time."""
    try:
        from utils.test_diffing import get_test_trends
        from utils.api_response import APIResponse
        
        days = request.args.get('days', 30, type=int)
        days = min(days, 365)  # Cap at 1 year
        
        trends = get_test_trends(project_id, days)
        
        return APIResponse.success(
            data=trends,
            message='Trends retrieved successfully'
        )
    
    except Exception as e:
        logger.exception(f"Error getting trends: {e}")
        from utils.api_response import APIResponse, ErrorCodes
        return APIResponse.error(str(e), ErrorCodes.INTERNAL_SERVER_ERROR), 500