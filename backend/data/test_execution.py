import data.database as database
import logging

logger = logging.getLogger(__name__)

def get_or_create_default_project(user_id=1):
    """
    Get or create a default project for the user.
    For Sprint 1, we use user_id=1 (will be replaced with JWT auth later)
    """
    conn = database.get_db_connection()
    cur = conn.cursor()
    
    try:
        # Check if default project exists
        cur.execute('''
            SELECT id FROM projects 
            WHERE user_id = %s AND name = 'My Tests'
        ''', (user_id,))
        
        result = cur.fetchone()
        
        if result:
            project_id = result[0]
            logger.debug("Using existing project: %s", project_id)
        else:
            # Create default project
            cur.execute('''
                INSERT INTO projects (user_id, name, description)
                VALUES (%s, %s, %s)
                RETURNING id
            ''', (user_id, 'My Tests', 'Default project for generated tests'))
            
            project_id = cur.fetchone()[0]
            conn.commit()
            logger.debug("Created new project: %s", project_id)
        
        return project_id
    
    finally:
        if cur:
            cur.close()
        if conn:
            database.return_db_connection(conn)
        
def create_execution_log(ai_request_id, total_tests, test_type='unit'):
    """ Creates an execution log entry for a test run
        args:
        ai_request_id: int
        total_tests: int
        test_type: str - 'unit' or 'integration'
        returns:
        execution_log_id: int

    """
    conn = None
    cur = None
    try:
        conn = database.get_db_connection()
        cur = conn.cursor()
        cur.execute('''
            INSERT INTO execution_logs (
                ai_request_id,
                total_tests,
                passed_count,
                failed_count,
                total_execution_time_ms,
                execution_status,
                execution_output,
                test_type
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING id
        ''', (
            ai_request_id,
            total_tests,0,0,0,'running','', test_type))
        
        execution_log_id = cur.fetchone()[0]
        conn.commit()

        logger.debug("Created execution log: %s (type: %s)", execution_log_id, test_type)
        return execution_log_id
    except Exception:
        logger.exception("Failed to create execution log")
        if conn:
            conn.rollback()
        return None
    finally:
        if cur:
            cur.close()
        if conn:
            database.return_db_connection(conn)
        
def save_test_case_result(execution_log_id, test_case_name, test_case_category, 
                          test_case_description, status, execution_time_ms=None, 
                          error_message=None, stack_trace=None):
    """
    Save an individual test case result.
    
    Args:
        execution_log_id: ID of the execution log this result belongs to
        test_case_name: Name of the test case (e.g., "test_add_positive_numbers")
        test_case_category: Category ("Happy Path", "Edge Case", "Error Handling")
        test_case_description: Human-readable description of what the test does
        status: Test result status ("passed", "failed", "skipped", "error")
        execution_time_ms: How long the test took in milliseconds (optional)
        error_message: Error message if test failed (optional)
        stack_trace: Full stack trace if test failed (optional)
        
    Returns:
        int: test_case_result_id or None if failed
    """
    conn = None
    cur = None
    try:
        conn = database.get_db_connection()
        cur = conn.cursor()
        
        cur.execute('''
            INSERT INTO test_case_results (
                execution_log_id,
                test_case_name,
                test_case_category,
                test_case_description,
                status,
                execution_time_ms,
                error_message,
                stack_trace
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING id
        ''', (
            execution_log_id,
            test_case_name,
            test_case_category,
            test_case_description,
            status,
            execution_time_ms,
            error_message,
            stack_trace
        ))
        
        result_id = cur.fetchone()[0]
        conn.commit()
        
        logger.debug("Saved test case result: %s - %s", test_case_name, status)
        return result_id
        
    except Exception:
        logger.exception("Failed to save test case result")
        if conn:
            conn.rollback()
        return None
        
    finally:
        if cur:
            cur.close()
        if conn:
            database.return_db_connection(conn)    

def update_execution_log_summary(execution_log_id, passed_count, failed_count, 
                                 total_execution_time_ms, execution_status, execution_output=''):
    """
    Update execution log with final summary after all tests complete.
    
    Args:
        execution_log_id: ID of the execution log to update
        passed_count: Number of tests that passed
        failed_count: Number of tests that failed
        total_execution_time_ms: Total time for all tests in milliseconds
        execution_status: Overall status ("passed" if all passed, "failed" if any failed)
        execution_output: Optional summary text (e.g., "5/5 tests passed")
        
    Returns:
        bool: True if successful, False otherwise
    """
    conn = None
    cur = None
    try:
        conn = database.get_db_connection()
        cur = conn.cursor()
        
        cur.execute('''
            UPDATE execution_logs
            SET passed_count = %s,
                failed_count = %s,
                total_tests = %s + %s,
                total_execution_time_ms = %s,
                execution_status = %s,
                execution_output = %s
            WHERE id = %s
        ''', (
            passed_count, 
            failed_count, 
            passed_count,
            failed_count,
            total_execution_time_ms, 
            execution_status, 
            execution_output, 
            execution_log_id
        ))
        
        conn.commit()
        
        logger.debug(
            "Updated execution log %s: %s passed, %s failed",
            execution_log_id,
            passed_count,
            failed_count,
        )
        return True
        
    except Exception:
        logger.exception("Failed to update execution log summary")
        if conn:
            conn.rollback()
        return False
        
    finally:
        if cur:
            cur.close()
        if conn:
            database.return_db_connection(conn)

def get_test_execution_results(execution_log_id):
    """
    Get all test case results for a specific execution.
    
    Args:
        execution_log_id: ID of the execution log
        
    Returns:
        list: List of dictionaries containing test case results, or empty list if none found
    """
    conn = None
    cur = None
    try:
        conn = database.get_db_connection()
        cur = conn.cursor()
        
        cur.execute('''
            SELECT 
                id,
                test_case_name,
                test_case_category,
                test_case_description,
                status,
                execution_time_ms,
                error_message,
                stack_trace,
                created_at
            FROM test_case_results
            WHERE execution_log_id = %s
            ORDER BY id
        ''', (execution_log_id,))
        
        results = cur.fetchall()
        
        # Convert to list of dictionaries for easier use
        test_results = []
        for row in results:
            test_results.append({
                'id': row[0],
                'test_case_name': row[1],
                'test_case_category': row[2],
                'test_case_description': row[3],
                'status': row[4],
                'execution_time_ms': row[5],
                'error_message': row[6],
                'stack_trace': row[7],
                'created_at': row[8]
            })
        
        logger.debug(
            "Retrieved %s test results for execution log %s",
            len(test_results),
            execution_log_id,
        )
        return test_results
        
    except Exception:
        logger.exception("Failed to get test execution results")
        return []
        
    finally:
        if cur:
            cur.close()
        if conn:
            database.return_db_connection(conn)

def extract_function_name(code_text):
    """Extract function name from code snippet"""
    if not code_text:
        return 'unknown_function'
    
    # Try to find Python function definition
    import re
    match = re.search(r'def\s+(\w+)\s*\(', code_text)
    if match:
        return match.group(1)
    
    # Try JavaScript/TypeScript
    match = re.search(r'function\s+(\w+)\s*\(', code_text)
    if match:
        return match.group(1)
    
    # Try arrow function with name
    match = re.search(r'const\s+(\w+)\s*=', code_text)
    if match:
        return match.group(1)
    
    # Fallback: use first 20 chars
    return code_text[:20].strip().replace('\n', ' ')        
