"""
Query optimization helpers for improved database performance.

Provides:
- Query performance monitoring
- Batch operations
- Database index recommendations
- Query result optimizations
"""

import logging
import time
from functools import wraps
from typing import List, Dict, Any, Optional, Tuple

logger = logging.getLogger(__name__)


class QueryPerformanceMonitor:
    """Monitor and log slow database queries."""
    
    def __init__(self, slow_query_threshold: float = 1.0):
        """
        Initialize query monitor.
        
        Args:
            slow_query_threshold: Threshold in seconds for logging slow queries
        """
        self.slow_query_threshold = slow_query_threshold
        self.slow_queries = []
    
    def monitor_query(self, query: str, params: tuple = None):
        """
        Context manager to monitor query execution time.
        
        Usage:
            monitor = QueryPerformanceMonitor()
            with monitor.monitor_query("SELECT * FROM users WHERE id = %s", (123,)):
                cursor.execute(query, params)
        """
        return QueryExecutionTimer(self, query, params)
    
    def log_slow_query(self, query: str, params: tuple, duration: float):
        """Log a slow query."""
        logger.warning(f"Slow query ({duration:.3f}s): {query[:200]} | Params: {params}")
        self.slow_queries.append({
            'query': query[:500],
            'params': params,
            'duration': duration,
            'timestamp': time.time()
        })
        
        # Keep only last 100 slow queries
        if len(self.slow_queries) > 100:
            self.slow_queries = self.slow_queries[-100:]
    
    def get_slow_queries(self, limit: int = 10) -> List[Dict[str, Any]]:
        """Get recent slow queries."""
        return self.slow_queries[-limit:]


class QueryExecutionTimer:
    """Context manager for timing query execution."""
    
    def __init__(self, monitor: QueryPerformanceMonitor, query: str, params: tuple):
        self.monitor = monitor
        self.query = query
        self.params = params
        self.start_time = None
    
    def __enter__(self):
        self.start_time = time.time()
        return self
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        duration = time.time() - self.start_time
        
        if duration > self.monitor.slow_query_threshold:
            self.monitor.log_slow_query(self.query, self.params, duration)
        else:
            logger.debug(f"Query executed in {duration:.3f}s: {self.query[:100]}")


# Global query monitor instance
query_monitor = QueryPerformanceMonitor(slow_query_threshold=1.0)


def batch_insert(cursor, table: str, columns: List[str], rows: List[tuple], batch_size: int = 100) -> int:
    """
    Perform batch insert operation for better performance.
    
    Args:
        cursor: Database cursor
        table: Table name
        columns: List of column names
        rows: List of tuples with values
        batch_size: Number of rows per batch
    
    Returns:
        int: Total number of rows inserted
    
    Usage:
        rows = [(1, 'Alice'), (2, 'Bob'), (3, 'Charlie')]
        batch_insert(cursor, 'users', ['id', 'name'], rows)
    """
    if not rows:
        return 0
    
    total_inserted = 0
    column_names = ', '.join(columns)
    placeholders = ', '.join(['%s'] * len(columns))
    
    # Process in batches
    for i in range(0, len(rows), batch_size):
        batch = rows[i:i + batch_size]
        
        # Build multi-row insert
        values_clause = ', '.join([f"({placeholders})" for _ in range(len(batch))])
        query = f"INSERT INTO {table} ({column_names}) VALUES {values_clause}"
        
        # Flatten batch into single tuple
        params = tuple(val for row in batch for val in row)
        
        with query_monitor.monitor_query(query, params):
            cursor.execute(query, params)
        
        total_inserted += len(batch)
    
    logger.info(f"Batch inserted {total_inserted} rows into {table}")
    return total_inserted


def batch_update(cursor, table: str, updates: List[Dict[str, Any]], key_column: str = 'id') -> int:
    """
    Perform batch update operation.
    
    Args:
        cursor: Database cursor
        table: Table name
        updates: List of dicts with {id: 1, column: value, ...}
        key_column: Primary key column name
    
    Returns:
        int: Number of rows updated
    
    Usage:
        updates = [
            {'id': 1, 'status': 'completed'},
            {'id': 2, 'status': 'failed'},
        ]
        batch_update(cursor, 'tests', updates)
    """
    if not updates:
        return 0
    
    total_updated = 0
    
    for update_dict in updates:
        if key_column not in update_dict:
            logger.warning(f"Skipping update: {key_column} not found in {update_dict}")
            continue
        
        key_value = update_dict[key_column]
        set_clauses = []
        params = []
        
        for col, val in update_dict.items():
            if col != key_column:
                set_clauses.append(f"{col} = %s")
                params.append(val)
        
        if not set_clauses:
            continue
        
        params.append(key_value)
        query = f"UPDATE {table} SET {', '.join(set_clauses)} WHERE {key_column} = %s"
        
        with query_monitor.monitor_query(query, tuple(params)):
            cursor.execute(query, tuple(params))
        
        total_updated += cursor.rowcount
    
    logger.info(f"Batch updated {total_updated} rows in {table}")
    return total_updated


def fetch_in_batches(cursor, query: str, params: tuple = None, batch_size: int = 1000):
    """
    Fetch large result sets in batches to reduce memory usage.
    
    Args:
        cursor: Database cursor
        query: SQL query
        params: Query parameters
        batch_size: Number of rows per batch
    
    Yields:
        List[tuple]: Batches of rows
    
    Usage:
        for batch in fetch_in_batches(cursor, "SELECT * FROM large_table"):
            process_batch(batch)
    """
    with query_monitor.monitor_query(query, params):
        if params:
            cursor.execute(query, params)
        else:
            cursor.execute(query)
    
    while True:
        batch = cursor.fetchmany(batch_size)
        if not batch:
            break
        yield batch


def optimize_in_clause(values: List[Any], max_params: int = 1000) -> List[Tuple[str, tuple]]:
    """
    Split large IN clause into multiple queries to avoid parameter limits.
    
    Args:
        values: List of values for IN clause
        max_params: Maximum parameters per query
    
    Returns:
        List of (query_fragment, params) tuples
    
    Usage:
        ids = list(range(5000))  # Large list
        for fragment, params in optimize_in_clause(ids):
            query = f"SELECT * FROM users WHERE id IN {fragment}"
            cursor.execute(query, params)
    """
    if not values:
        return []
    
    chunks = []
    for i in range(0, len(values), max_params):
        chunk = values[i:i + max_params]
        placeholders = ', '.join(['%s'] * len(chunk))
        fragment = f"({placeholders})"
        chunks.append((fragment, tuple(chunk)))
    
    return chunks


def build_upsert_query(table: str, columns: List[str], conflict_column: str, update_columns: List[str] = None) -> str:
    """
    Build PostgreSQL UPSERT (INSERT ... ON CONFLICT) query.
    
    Args:
        table: Table name
        columns: All columns for insert
        conflict_column: Column that triggers conflict
        update_columns: Columns to update on conflict (None = all except conflict)
    
    Returns:
        str: UPSERT query template
    
    Usage:
        query = build_upsert_query('users', ['id', 'name', 'email'], 'email', ['name'])
        cursor.execute(query, (1, 'Alice', 'alice@example.com'))
    """
    if update_columns is None:
        update_columns = [col for col in columns if col != conflict_column]
    
    column_names = ', '.join(columns)
    placeholders = ', '.join(['%s'] * len(columns))
    update_clauses = ', '.join([f"{col} = EXCLUDED.{col}" for col in update_columns])
    
    query = f"""
        INSERT INTO {table} ({column_names})
        VALUES ({placeholders})
        ON CONFLICT ({conflict_column}) DO UPDATE SET {update_clauses}
    """
    
    return query.strip()


def explain_query(cursor, query: str, params: tuple = None) -> List[str]:
    """
    Get query execution plan (EXPLAIN) for optimization.
    
    Args:
        cursor: Database cursor
        query: SQL query to analyze
        params: Query parameters
    
    Returns:
        List[str]: EXPLAIN output lines
    
    Usage:
        plan = explain_query(cursor, "SELECT * FROM users WHERE email = %s", ('test@example.com',))
        for line in plan:
            print(line)
    """
    explain_query = f"EXPLAIN ANALYZE {query}"
    
    try:
        if params:
            cursor.execute(explain_query, params)
        else:
            cursor.execute(explain_query)
        
        results = cursor.fetchall()
        return [row[0] for row in results]
    except Exception as e:
        logger.exception(f"Error explaining query: {e}")
        return []


def suggest_indexes(cursor) -> List[Dict[str, Any]]:
    """
    Analyze queries and suggest missing indexes.
    
    This is a simplified version. For production, consider using
    pg_stat_statements extension for better analysis.
    
    Args:
        cursor: Database cursor
    
    Returns:
        List[Dict]: List of index suggestions
    """
    suggestions = []
    
    try:
        # Check for foreign keys without indexes
        cursor.execute("""
            SELECT
                tc.table_name,
                kcu.column_name,
                ccu.table_name AS foreign_table_name,
                ccu.column_name AS foreign_column_name
            FROM information_schema.table_constraints AS tc
            JOIN information_schema.key_column_usage AS kcu
                ON tc.constraint_name = kcu.constraint_name
                AND tc.table_schema = kcu.table_schema
            JOIN information_schema.constraint_column_usage AS ccu
                ON ccu.constraint_name = tc.constraint_name
                AND ccu.table_schema = tc.table_schema
            WHERE tc.constraint_type = 'FOREIGN KEY'
                AND tc.table_schema = 'public'
        """)
        
        foreign_keys = cursor.fetchall()
        
        for fk in foreign_keys:
            table_name, column_name, foreign_table, foreign_column = fk
            
            # Check if index exists
            cursor.execute("""
                SELECT COUNT(*)
                FROM pg_indexes
                WHERE tablename = %s
                    AND indexdef LIKE %s
            """, (table_name, f'%{column_name}%'))
            
            index_exists = cursor.fetchone()[0] > 0
            
            if not index_exists:
                suggestions.append({
                    'table': table_name,
                    'column': column_name,
                    'reason': f'Foreign key to {foreign_table}({foreign_column}) without index',
                    'query': f'CREATE INDEX idx_{table_name}_{column_name} ON {table_name}({column_name});'
                })
        
    except Exception as e:
        logger.exception(f"Error suggesting indexes: {e}")
    
    return suggestions


def get_table_stats(cursor, table_name: str) -> Dict[str, Any]:
    """
    Get statistics for a table.
    
    Args:
        cursor: Database cursor
        table_name: Table name
    
    Returns:
        dict: Table statistics
    """
    stats = {}
    
    try:
        # Row count
        cursor.execute(f"SELECT COUNT(*) FROM {table_name}")
        stats['row_count'] = cursor.fetchone()[0]
        
        # Table size
        cursor.execute("""
            SELECT pg_size_pretty(pg_total_relation_size(%s)) as size
        """, (table_name,))
        stats['size'] = cursor.fetchone()[0]
        
        # Index count and size
        cursor.execute("""
            SELECT
                COUNT(*) as index_count,
                pg_size_pretty(SUM(pg_relation_size(indexrelid))) as index_size
            FROM pg_index
            JOIN pg_class ON pg_class.oid = pg_index.indrelid
            WHERE pg_class.relname = %s
        """, (table_name,))
        
        result = cursor.fetchone()
        stats['index_count'] = result[0]
        stats['index_size'] = result[1]
        
    except Exception as e:
        logger.exception(f"Error getting table stats for {table_name}: {e}")
    
    return stats


def optimize_connection(cursor):
    """
    Apply PostgreSQL connection optimizations.
    
    Args:
        cursor: Database cursor
    """
    try:
        # Set work_mem for complex queries (per connection)
        cursor.execute("SET work_mem = '32MB'")
        
        # Enable parallel query execution
        cursor.execute("SET max_parallel_workers_per_gather = 4")
        
        logger.debug("Applied connection optimizations")
    except Exception as e:
        logger.exception(f"Error optimizing connection: {e}")


def vacuum_analyze_table(cursor, table_name: str):
    """
    Run VACUUM ANALYZE on a table to update statistics.
    
    Note: This requires autocommit mode or a separate connection.
    
    Args:
        cursor: Database cursor
        table_name: Table name
    """
    try:
        cursor.execute(f"VACUUM ANALYZE {table_name}")
        logger.info(f"VACUUM ANALYZE completed for {table_name}")
    except Exception as e:
        logger.exception(f"Error running VACUUM ANALYZE on {table_name}: {e}")


class QueryBuilder:
    """Fluent query builder for safer SQL construction."""
    
    def __init__(self, table: str):
        self.table = table
        self.select_columns = ['*']
        self.where_conditions = []
        self.where_params = []
        self.order_by_clauses = []
        self.limit_value = None
        self.offset_value = None
    
    def select(self, *columns):
        """Set SELECT columns."""
        self.select_columns = list(columns)
        return self
    
    def where(self, condition: str, *params):
        """Add WHERE condition."""
        self.where_conditions.append(condition)
        self.where_params.extend(params)
        return self
    
    def order_by(self, column: str, direction: str = 'ASC'):
        """Add ORDER BY clause."""
        direction = direction.upper()
        if direction not in ['ASC', 'DESC']:
            direction = 'ASC'
        self.order_by_clauses.append(f"{column} {direction}")
        return self
    
    def limit(self, limit: int):
        """Set LIMIT."""
        self.limit_value = limit
        return self
    
    def offset(self, offset: int):
        """Set OFFSET."""
        self.offset_value = offset
        return self
    
    def build(self) -> Tuple[str, tuple]:
        """Build SQL query and parameters."""
        columns = ', '.join(self.select_columns)
        query = f"SELECT {columns} FROM {self.table}"
        
        if self.where_conditions:
            query += " WHERE " + " AND ".join(self.where_conditions)
        
        if self.order_by_clauses:
            query += " ORDER BY " + ", ".join(self.order_by_clauses)
        
        if self.limit_value is not None:
            query += f" LIMIT {self.limit_value}"
        
        if self.offset_value is not None:
            query += f" OFFSET {self.offset_value}"
        
        return query, tuple(self.where_params)
    
    def execute(self, cursor):
        """Build and execute query."""
        query, params = self.build()
        with query_monitor.monitor_query(query, params):
            cursor.execute(query, params)
        return cursor
