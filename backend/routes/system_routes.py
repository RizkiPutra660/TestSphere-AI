# routes/database_routes.py
from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required
from datetime import datetime
import data.database as database
from utils.logger import setup_logger
from utils.metrics import get_metrics_collector
import os
import re
import requests

logger = setup_logger(__name__)

# Create Blueprint for database routes
db_bp = Blueprint('database', __name__, url_prefix='/api')

def check_database_health():
    """Check database connectivity and performance"""
    try:
        import time
        start = time.time()
        
        conn = database.get_db_connection()
        cur = conn.cursor()
        
        # Test query
        cur.execute('SELECT 1;')
        cur.fetchone()
        
        # Get version
        cur.execute('SELECT version();')
        db_version = cur.fetchone()[0]
        
        cur.close()
        database.return_db_connection(conn)
        
        duration = time.time() - start
        
        return {
            'status': 'healthy',
            'response_time_ms': round(duration * 1000, 2),
            'version': db_version.split(',')[0] if db_version else 'unknown',
            'pool_available': True
        }
    except Exception as e:
        logger.error(f"Database health check failed: {e}")
        return {
            'status': 'unhealthy',
            'error': str(e)
        }

def check_llm_service_health():
    """Check LLM service availability"""
    try:
        import time
        from utils.llm_service import llm_service
        
        start = time.time()
        
        # Simple test prompt
        response = llm_service.generate_with_retry(
            "Test",
            max_tokens=10,
            temperature=0.1
        )
        
        duration = time.time() - start
        
        return {
            'status': 'healthy',
            'response_time_ms': round(duration * 1000, 2),
            'provider': getattr(llm_service, 'provider', 'unknown')
        }
    except Exception as e:
        logger.warning(f"LLM service health check failed: {e}")
        return {
            'status': 'degraded',
            'error': str(e)[:100]  # Truncate error message
        }

def check_external_apis():
    """Check external API connectivity"""
    results = {}
    
    # Check GitHub API
    try:
        response = requests.get('https://api.github.com', timeout=5)
        results['github'] = {
            'status': 'healthy' if response.status_code == 200 else 'degraded',
            'response_code': response.status_code
        }
    except Exception as e:
        results['github'] = {
            'status': 'unhealthy',
            'error': str(e)[:50]
        }
    
    # Check GitLab API
    try:
        response = requests.get('https://gitlab.com/api/v4/version', timeout=5)
        results['gitlab'] = {
            'status': 'healthy' if response.status_code == 200 else 'degraded',
            'response_code': response.status_code
        }
    except Exception as e:
        results['gitlab'] = {
            'status': 'unhealthy',
            'error': str(e)[:50]
        }
    
    return results

@db_bp.route('/health', methods=['GET'])
def health_check():
    """Comprehensive health check endpoint"""
    detailed = request.args.get('detailed', 'false').lower() == 'true'
    
    # Basic health check
    db_health = check_database_health()
    
    response = {
        'status': db_health['status'],
        'timestamp': datetime.now().isoformat(),
        'database': db_health
    }
    
    # Detailed health check (includes all dependencies)
    if detailed:
        response['llm_service'] = check_llm_service_health()
        response['external_apis'] = check_external_apis()
        
        # Add metrics
        metrics = get_metrics_collector()
        response['metrics'] = metrics.get_global_stats()
    
    # Determine overall status
    statuses = [db_health['status']]
    if detailed:
        statuses.append(response.get('llm_service', {}).get('status', 'unknown'))
    
    if 'unhealthy' in statuses:
        response['status'] = 'unhealthy'
        return jsonify(response), 503
    elif 'degraded' in statuses:
        response['status'] = 'degraded'
        return jsonify(response), 200
    else:
        response['status'] = 'healthy'
        return jsonify(response), 200

@db_bp.route('/stats', methods=['GET'])
@jwt_required()
def get_stats():
    try:
        conn = database.get_db_connection()
        cur = conn.cursor()
        
        # Get actual counts from database
        cur.execute('SELECT COUNT(*) FROM users')
        total_users_result = cur.fetchone()
        total_users = total_users_result[0] if total_users_result else 0
        
        cur.execute('SELECT COUNT(*) FROM users WHERE is_active = TRUE')
        active_users_result = cur.fetchone()
        active_users = active_users_result[0] if active_users_result else 0
        
        cur.execute('SELECT COUNT(*) FROM users WHERE role = %s', ('admin',))
        admin_count_result = cur.fetchone()
        admin_count = admin_count_result[0] if admin_count_result else 0
        
        cur.execute('SELECT MAX(created_at) FROM users')
        latest_user_result = cur.fetchone()
        latest_user = latest_user_result[0] if latest_user_result else None
        
        cur.close()
        database.return_db_connection(conn)
        
        return jsonify({
            'total_users': total_users,
            'active_users': active_users,
            'admin_count': admin_count,
            'latest_user': latest_user.isoformat() if latest_user else None,
            'database_size': 'Connected and operational'
        })
    
    except Exception as e:
        logger.exception(f"Error getting stats: {e}")
        return jsonify({'error': str(e)}), 500

@db_bp.route('/metrics', methods=['GET'])
@jwt_required()
def get_metrics():
    """Get application performance metrics"""
    try:
        metrics = get_metrics_collector()
        all_stats = metrics.get_all_stats()
        
        return jsonify(all_stats), 200
    except Exception as e:
        logger.exception(f"Error getting metrics: {e}")
        return jsonify({'error': str(e)}), 500

@db_bp.route('/database/info', methods=['GET'])
@jwt_required()
def database_info():
    try:
        conn = database.get_db_connection()
        cur = conn.cursor()
        
        # Get table information
        cur.execute('''
            SELECT 
                table_name,
                column_name,
                data_type,
                is_nullable
            FROM information_schema.columns 
            WHERE table_schema = 'public'
            ORDER BY table_name, ordinal_position
        ''')
        
        schema = {}
        for table_name, column_name, data_type, is_nullable in cur.fetchall():
            if table_name not in schema:
                schema[table_name] = []
            schema[table_name].append({
                'column': column_name,
                'type': data_type,
                'nullable': is_nullable
            })
        
        # Get row counts
        cur.execute('''
            SELECT 
                table_name,
                (xpath('/row/cnt/text()', 
                    query_to_xml(format('SELECT COUNT(*) AS cnt FROM %I', table_name), 
                    false, true, '')))[1]::text::int AS row_count
            FROM information_schema.tables 
            WHERE table_schema = 'public'
        ''')
        
        table_counts = {table: count for table, count in cur.fetchall()}
        
        cur.close()

        
        database.return_db_connection(conn)
        
        return jsonify({
            'schema': schema,
            'table_counts': table_counts,
            'database_name': os.getenv('DB_NAME', 'poc_database')
        })
    
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    
@db_bp.route('/database/table/<table_name>', methods=['GET'])
@jwt_required()
def get_table_data(table_name):
    try:
        conn = database.get_db_connection()
        cur = conn.cursor()

        # 1. Security Check: Ensure table exists in public schema to prevent Injection
        cur.execute("SELECT to_regclass(%s)", (f"public.{table_name}",))
        if cur.fetchone()[0] is None:
            return jsonify({'error': 'Table not found'}), 404

        # 2. Get Data (Safe usage of table_name after check)
        # We use sql.SQL to safely identifier formatting if using psycopg2, 
        # but for simplicity with standard cursor:
        query = f"SELECT * FROM {table_name} ORDER BY 1 DESC LIMIT 100" 
        cur.execute(query)
        
        # 3. Get Column Names
        colnames = [desc[0] for desc in cur.description]
        
        # 4. Format Rows to Dictionary
        rows = cur.fetchall()
        results = []
        for row in rows:
            # zip creates a dict: {'id': 1, 'username': '...'}
            results.append(dict(zip(colnames, row)))

        cur.close()


        database.return_db_connection(conn)

        return jsonify(results)

    except Exception as e:
        logger.exception(f"Error fetching table {table_name}: {e}")
        return jsonify({'error': str(e)}), 500

# --- NEW ROUTE: Delete a row from any table ---
@db_bp.route('/database/table/<table_name>/<row_id>', methods=['DELETE'])
@jwt_required()
def delete_table_row(table_name, row_id):
    try:
        conn = database.get_db_connection()
        cur = conn.cursor()

        # 1. Security Check
        cur.execute("SELECT to_regclass(%s)", (f"public.{table_name}",))
        if cur.fetchone()[0] is None:
            return jsonify({'error': 'Table not found'}), 404

        # 2. Dynamic Primary Key Discovery
        # (Finds out if the table uses 'id', 'credential_id', etc.)
        cur.execute("""
            SELECT a.attname
            FROM   pg_index i
            JOIN   pg_attribute a ON a.attrelid = i.indrelid
                                 AND a.attnum = ANY(i.indkey)
            WHERE  i.indrelid = %s::regclass
            AND    i.indisprimary;
        """, (table_name,))
        
        pk_result = cur.fetchone()
        pk_column = pk_result[0] if pk_result else 'id' # Default to 'id' if no PK found

        # 3. Execute Delete
        # NOTE: table_name and pk_column are system identifiers, row_id is a value
        query = f"DELETE FROM {table_name} WHERE {pk_column} = %s"
        cur.execute(query, (row_id,))
        
        conn.commit()
        cur.close()

        database.return_db_connection(conn)

        return jsonify({'message': f'Row {row_id} deleted from {table_name}'})

    except Exception as e:
        print(f"Error deleting from {table_name}: {e}")
        return jsonify({'error': str(e)}), 500

