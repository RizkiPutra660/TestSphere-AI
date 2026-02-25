"""
Database Migration Runner
Executes SQL migration files in order from the migrations/ directory
"""
import os
import sys
import psycopg2
from dotenv import load_dotenv

load_dotenv()

def get_db_connection():
    """Get database connection"""
    try:
        conn = psycopg2.connect(
            host=os.getenv('DB_HOST', 'localhost'),
            database=os.getenv('DB_NAME', 'qa_automation'),
            user=os.getenv('DB_USER', 'admin'),
            password=os.getenv('DB_PASSWORD', 'password'),
            port=os.getenv('DB_PORT', '5432')
        )
        return conn
    except Exception as e:
        print(f"[X] Database connection failed: {e}")
        raise

def create_migrations_table():
    """Create a table to track which migrations have been run"""
    conn = get_db_connection()
    cur = conn.cursor()
    
    cur.execute("""
        CREATE TABLE IF NOT EXISTS schema_migrations (
            id SERIAL PRIMARY KEY,
            migration_name VARCHAR(255) UNIQUE NOT NULL,
            applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    
    conn.commit()
    cur.close()
    conn.close()
    print("[OK] Migrations tracking table ready")

def get_applied_migrations():
    """Get list of migrations that have already been applied"""
    conn = get_db_connection()
    cur = conn.cursor()
    
    cur.execute("SELECT migration_name FROM schema_migrations ORDER BY migration_name")
    applied = [row[0] for row in cur.fetchall()]
    
    cur.close()
    conn.close()
    return applied

def get_pending_migrations(migrations_dir):
    """Get list of migration files that haven't been applied yet"""
    if not os.path.exists(migrations_dir):
        print(f"[X] Migrations directory not found: {migrations_dir}")
        return []
    
    all_migrations = sorted([
        f for f in os.listdir(migrations_dir) 
        if f.endswith('.sql')
    ])
    
    applied = get_applied_migrations()
    pending = [m for m in all_migrations if m not in applied]
    
    return pending

def run_migration(migration_file, migrations_dir):
    """Execute a single migration file"""
    migration_path = os.path.join(migrations_dir, migration_file)
    
    print(f"[~] Running migration: {migration_file}")
    
    try:
        with open(migration_path, 'r') as f:
            sql = f.read()
        
        conn = get_db_connection()
        cur = conn.cursor()
        
        # Execute the migration
        cur.execute(sql)
        
        # Record that this migration has been applied
        cur.execute(
            "INSERT INTO schema_migrations (migration_name) VALUES (%s)",
            (migration_file,)
        )
        
        conn.commit()
        cur.close()
        conn.close()
        
        print(f"[OK] Migration applied: {migration_file}")
        return True
        
    except Exception as e:
        print(f"[X] Migration failed: {migration_file}")
        print(f"    Error: {e}")
        return False

def run_migrations():
    """Run all pending migrations"""
    current_dir = os.path.dirname(os.path.abspath(__file__))
    migrations_dir = os.path.join(current_dir, 'migrations')
    
    print("=" * 60)
    print("DATABASE MIGRATION RUNNER")
    print("=" * 60)
    
    # Create migrations tracking table if it doesn't exist
    create_migrations_table()
    
    # Get pending migrations
    pending = get_pending_migrations(migrations_dir)
    
    if not pending:
        print("[OK] No pending migrations. Database is up to date!")
        return True
    
    print(f"\n[*] Found {len(pending)} pending migration(s):")
    for m in pending:
        print(f"    - {m}")
    
    print("\n" + "=" * 60)
    
    # Run each pending migration
    success_count = 0
    for migration in pending:
        if run_migration(migration, migrations_dir):
            success_count += 1
        else:
            print(f"\n[X] Migration process stopped due to error")
            return False
    
    print("\n" + "=" * 60)
    print(f"[OK] Successfully applied {success_count}/{len(pending)} migration(s)")
    print("=" * 60)
    return True

if __name__ == "__main__":
    try:
        success = run_migrations()
        sys.exit(0 if success else 1)
    except Exception as e:
        print(f"[X] Migration runner failed: {e}")
        sys.exit(1)
