import psycopg2
from psycopg2 import pool
from psycopg2.extras import RealDictCursor
import os
from dotenv import load_dotenv
from contextlib import contextmanager
import time

load_dotenv()

# Global connection pool
_connection_pool = None

def initialize_connection_pool(minconn=2, maxconn=10):
    """Initialize database connection pool"""
    global _connection_pool
    
    if _connection_pool is None:
        try:
            _connection_pool = pool.ThreadedConnectionPool(
                minconn,
                maxconn,
                host=os.getenv('DB_HOST', 'localhost'),
                database=os.getenv('DB_NAME', 'qa_automation'),
                user=os.getenv('DB_USER', 'admin'),
                password=os.getenv('DB_PASSWORD', 'password'),
                port=os.getenv('DB_PORT', '5432'),
                sslmode=os.getenv('DB_SSLMODE', 'disable'),
                connect_timeout=10
            )
            return True
        except Exception as e:
            print(f"[X] Failed to initialize connection pool: {e}")
            return False
    return True

def get_db_connection():
    """Get database connection from pool"""
    global _connection_pool
    
    # Initialize pool if not exists
    if _connection_pool is None:
        initialize_connection_pool()
    
    try:
        conn = _connection_pool.getconn()
        if conn:
            return conn
        raise Exception("Unable to get connection from pool")
    except Exception as e:
        print(f"[X] Database connection failed: {e}")
        raise

def return_db_connection(conn):
    """Return connection to pool"""
    global _connection_pool
    if _connection_pool and conn:
        _connection_pool.putconn(conn)

def close_all_connections():
    """Close all connections in pool (for graceful shutdown)"""
    global _connection_pool
    if _connection_pool:
        _connection_pool.closeall()
        _connection_pool = None

@contextmanager
def get_db_connection_context():
    """Context manager for database connections"""
    conn = get_db_connection()
    try:
        yield conn
    finally:
        return_db_connection(conn)

def get_db_cursor(connection, dict_cursor=True):
    """Get a cursor from connection"""
    if dict_cursor:
        return connection.cursor(cursor_factory=RealDictCursor)
    return connection.cursor()

def execute_query(query, params=None, fetch=False, fetch_one=False):
    """
    Execute a query with parameters
    
    Args:
        query: SQL query string
        params: Query parameters (tuple or dict)
        fetch: Whether to fetch results
        fetch_one: Fetch only one result
    
    Returns:
        Query results if fetch=True, else None
    """
    conn = None
    try:
        conn = get_db_connection()
        cur = get_db_cursor(conn)
        
        cur.execute(query, params)
        
        # Always commit before fetching results (for INSERT...RETURNING, UPDATE...RETURNING, etc.)
        # Only rollback on exception
        conn.commit()
        
        if fetch:
            result = cur.fetchone() if fetch_one else cur.fetchall()
            cur.close()
            return_db_connection(conn)
            return result
        
        cur.close()
        return_db_connection(conn)
        return True
        
    except Exception as e:
        if conn:
            conn.rollback()
            return_db_connection(conn)
        print(f"[X] Query execution failed: {e}")
        raise

def test_connection():
    """Test database connection and pool health"""
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("SELECT 1;")
        result = cur.fetchone()
        cur.close()
        return_db_connection(conn)
        return result is not None
    except Exception as e:
        if conn:
            return_db_connection(conn)
        print(f"[X] Connection test failed: {e}")
        return False
        return True
    except Exception as e:
        print(f"[ERROR] Database connection failed: {e}")
        return False

def create_database():
    """
    Check if database exists, if not create it.
    Note: In this setup, Docker usually creates the DB. 
    This function is kept for compatibility with app.py calls.
    """
    # Since we connect to the specific DB in get_db_connection, 
    # if that succeeds, the DB exists.
    try:
        conn = get_db_connection()
        conn.close()
        print("[OK] Database exists and is accessible")
        return True
    except Exception as e:
        print(f"[!] Database might not exist or is inaccessible: {e}")
        # Logic to create DB would go here if needed, connecting to 'postgres' db first
        return False

def initialize_database():
    """Initialize database schema from init.sql"""
    try:
        # Get the directory of the current file
        current_dir = os.path.dirname(os.path.abspath(__file__))
        init_sql_path = os.path.join(current_dir, 'init.sql')
        
        if not os.path.exists(init_sql_path):
            print(f"[X] init.sql not found at {init_sql_path}")
            return False
            
        with open(init_sql_path, 'r') as f:
            sql_script = f.read()
            
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute(sql_script)
        conn.commit()
        cur.close()
        conn.close()
        print("[OK] Database initialized from init.sql")
        return True
    except Exception as e:
        print(f"[X] Failed to initialize database: {e}")
        return False

if __name__ == "__main__":
    # Test the connection when running this file directly
    test_connection()