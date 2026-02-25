"""
Test run comparison and diffing utilities.

Provides functionality to compare test results between commits,
identify regressions, improvements, and new/removed tests.
"""

from typing import Dict, List, Any, Optional, Tuple
from dataclasses import dataclass, asdict
from datetime import datetime
import data.database as db
from utils.logger import setup_logger

logger = setup_logger(__name__)


@dataclass
class TestResult:
    """Individual test result."""
    name: str
    status: str  # 'passed', 'failed', 'skipped'
    execution_time_ms: Optional[int] = None
    error_message: Optional[str] = None


@dataclass
class TestRunSummary:
    """Summary of a test run."""
    run_id: int
    commit_sha: str
    commit_message: Optional[str]
    branch_name: Optional[str]
    total_tests: int
    passed_tests: int
    failed_tests: int
    skipped_tests: int
    coverage_percentage: Optional[float]
    execution_time_ms: int
    created_at: str
    
    def pass_rate(self) -> float:
        """Calculate pass rate percentage."""
        if self.total_tests == 0:
            return 0.0
        return (self.passed_tests / self.total_tests) * 100


@dataclass
class TestDiff:
    """Difference between two test runs."""
    base_run: TestRunSummary
    compare_run: TestRunSummary
    
    # Test changes
    new_tests: List[str]  # Tests added in compare
    removed_tests: List[str]  # Tests removed from base
    fixed_tests: List[str]  # Tests that were failing, now passing
    broken_tests: List[str]  # Tests that were passing, now failing
    still_failing: List[str]  # Tests failing in both
    still_passing: List[str]  # Tests passing in both (only count if significant)
    
    # Metrics
    total_change: int
    pass_rate_change: float
    coverage_change: Optional[float]
    execution_time_change: int
    
    def is_improvement(self) -> bool:
        """Check if compare run is an improvement over base."""
        return (
            len(self.fixed_tests) > len(self.broken_tests) and
            self.pass_rate_change >= 0
        )
    
    def is_regression(self) -> bool:
        """Check if compare run is a regression from base."""
        return (
            len(self.broken_tests) > len(self.fixed_tests) or
            self.pass_rate_change < -5  # More than 5% drop
        )
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary."""
        return {
            'base_run': asdict(self.base_run),
            'compare_run': asdict(self.compare_run),
            'changes': {
                'new_tests': self.new_tests,
                'removed_tests': self.removed_tests,
                'fixed_tests': self.fixed_tests,
                'broken_tests': self.broken_tests,
                'still_failing': self.still_failing[:10],  # Limit output
                'still_passing_count': len(self.still_passing)
            },
            'metrics': {
                'total_change': self.total_change,
                'pass_rate_change': round(self.pass_rate_change, 2),
                'coverage_change': round(self.coverage_change, 2) if self.coverage_change else None,
                'execution_time_change': self.execution_time_change,
                'execution_time_change_percent': round(
                    (self.execution_time_change / self.base_run.execution_time_ms * 100)
                    if self.base_run.execution_time_ms > 0 else 0,
                    2
                )
            },
            'summary': {
                'is_improvement': self.is_improvement(),
                'is_regression': self.is_regression(),
                'status': self._get_status_message()
            }
        }
    
    def _get_status_message(self) -> str:
        """Get human-readable status message."""
        if self.is_improvement():
            return f"✅ Improvement: {len(self.fixed_tests)} tests fixed, {len(self.broken_tests)} broken"
        elif self.is_regression():
            return f"⚠️ Regression: {len(self.broken_tests)} tests broken, {len(self.fixed_tests)} fixed"
        else:
            return f"➡️ Neutral: {len(self.new_tests)} new, {len(self.removed_tests)} removed"


def save_test_run_history(
    project_id: int,
    test_id: int,
    commit_sha: Optional[str],
    commit_message: Optional[str],
    branch_name: Optional[str],
    total_tests: int,
    passed_tests: int,
    failed_tests: int,
    skipped_tests: int = 0,
    coverage_percentage: Optional[float] = None,
    execution_time_ms: Optional[int] = None
) -> int:
    """
    Save test run results to history.
    
    Args:
        project_id: Project ID
        test_id: Test ID
        commit_sha: Git commit SHA
        commit_message: Commit message
        branch_name: Git branch name
        total_tests: Total test count
        passed_tests: Passed test count
        failed_tests: Failed test count
        skipped_tests: Skipped test count
        coverage_percentage: Code coverage percentage
        execution_time_ms: Execution time in milliseconds
    
    Returns:
        History record ID
    """
    try:
        conn = db.get_db_connection()
        cur = conn.cursor()
        
        cur.execute("""
            INSERT INTO test_run_history
            (project_id, test_id, commit_sha, commit_message, branch_name,
             total_tests, passed_tests, failed_tests, skipped_tests,
             coverage_percentage, execution_time_ms)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING id
        """, (
            project_id, test_id, commit_sha, commit_message, branch_name,
            total_tests, passed_tests, failed_tests, skipped_tests,
            coverage_percentage, execution_time_ms
        ))
        
        history_id = cur.fetchone()[0]
        conn.commit()
        cur.close()
        db.return_db_connection(conn)
        
        logger.info(f"Saved test run history: {history_id} for test {test_id}")
        return history_id
    
    except Exception as e:
        logger.error(f"Failed to save test run history: {e}")
        raise


def get_test_run_by_commit(project_id: int, commit_sha: str) -> Optional[TestRunSummary]:
    """
    Get test run summary by commit SHA.
    
    Args:
        project_id: Project ID
        commit_sha: Commit SHA
    
    Returns:
        Test run summary or None
    """
    try:
        conn = db.get_db_connection()
        cur = conn.cursor()
        
        cur.execute("""
            SELECT id, commit_sha, commit_message, branch_name,
                   total_tests, passed_tests, failed_tests, skipped_tests,
                   coverage_percentage, execution_time_ms, created_at
            FROM test_run_history
            WHERE project_id = %s AND commit_sha = %s
            ORDER BY created_at DESC
            LIMIT 1
        """, (project_id, commit_sha))
        
        row = cur.fetchone()
        cur.close()
        db.return_db_connection(conn)
        
        if row:
            return TestRunSummary(
                run_id=row[0],
                commit_sha=row[1],
                commit_message=row[2],
                branch_name=row[3],
                total_tests=row[4],
                passed_tests=row[5],
                failed_tests=row[6],
                skipped_tests=row[7],
                coverage_percentage=float(row[8]) if row[8] else None,
                execution_time_ms=row[9] or 0,
                created_at=row[10].isoformat() if row[10] else None
            )
        
        return None
    
    except Exception as e:
        logger.error(f"Failed to get test run by commit: {e}")
        return None


def get_test_run_history(project_id: int, limit: int = 50) -> List[TestRunSummary]:
    """
    Get test run history for a project.
    
    Args:
        project_id: Project ID
        limit: Maximum number of runs to return
    
    Returns:
        List of test run summaries
    """
    try:
        conn = db.get_db_connection()
        cur = conn.cursor()
        
        cur.execute("""
            SELECT id, commit_sha, commit_message, branch_name,
                   total_tests, passed_tests, failed_tests, skipped_tests,
                   coverage_percentage, execution_time_ms, created_at
            FROM test_run_history
            WHERE project_id = %s
            ORDER BY created_at DESC
            LIMIT %s
        """, (project_id, limit))
        
        runs = []
        for row in cur.fetchall():
            runs.append(TestRunSummary(
                run_id=row[0],
                commit_sha=row[1],
                commit_message=row[2],
                branch_name=row[3],
                total_tests=row[4],
                passed_tests=row[5],
                failed_tests=row[6],
                skipped_tests=row[7],
                coverage_percentage=float(row[8]) if row[8] else None,
                execution_time_ms=row[9] or 0,
                created_at=row[10].isoformat() if row[10] else None
            ))
        
        cur.close()
        db.return_db_connection(conn)
        
        return runs
    
    except Exception as e:
        logger.error(f"Failed to get test run history: {e}")
        return []


def compare_test_runs(
    project_id: int,
    base_commit: str,
    compare_commit: str
) -> Optional[TestDiff]:
    """
    Compare two test runs by commit SHA.
    
    Args:
        project_id: Project ID
        base_commit: Base commit SHA (old)
        compare_commit: Compare commit SHA (new)
    
    Returns:
        Test diff or None if runs not found
    """
    try:
        # Get both test runs
        base_run = get_test_run_by_commit(project_id, base_commit)
        compare_run = get_test_run_by_commit(project_id, compare_commit)
        
        if not base_run or not compare_run:
            logger.warning(f"Could not find test runs for commits: {base_commit}, {compare_commit}")
            return None
        
        # For now, we'll calculate high-level metrics
        # TODO: Parse actual test results from execution logs for detailed comparisons
        
        # Calculate changes
        total_change = compare_run.total_tests - base_run.total_tests
        pass_rate_change = compare_run.pass_rate() - base_run.pass_rate()
        coverage_change = None
        if base_run.coverage_percentage and compare_run.coverage_percentage:
            coverage_change = compare_run.coverage_percentage - base_run.coverage_percentage
        
        execution_time_change = compare_run.execution_time_ms - base_run.execution_time_ms
        
        # Estimate test changes (simplified for now)
        # In a full implementation, you'd parse actual test results
        new_tests = []
        removed_tests = []
        fixed_tests = []
        broken_tests = []
        
        if compare_run.failed_tests < base_run.failed_tests:
            # Some tests were fixed
            fixed_count = base_run.failed_tests - compare_run.failed_tests
            fixed_tests = [f"fixed_test_{i}" for i in range(fixed_count)]
        
        if compare_run.failed_tests > base_run.failed_tests:
            # Some tests broke
            broken_count = compare_run.failed_tests - base_run.failed_tests
            broken_tests = [f"broken_test_{i}" for i in range(broken_count)]
        
        if total_change > 0:
            new_tests = [f"new_test_{i}" for i in range(total_change)]
        elif total_change < 0:
            removed_tests = [f"removed_test_{i}" for i in range(abs(total_change))]
        
        still_failing = [f"failing_test_{i}" for i in range(min(compare_run.failed_tests, base_run.failed_tests))]
        still_passing = [f"passing_test_{i}" for i in range(min(compare_run.passed_tests, base_run.passed_tests))]
        
        diff = TestDiff(
            base_run=base_run,
            compare_run=compare_run,
            new_tests=new_tests,
            removed_tests=removed_tests,
            fixed_tests=fixed_tests,
            broken_tests=broken_tests,
            still_failing=still_failing,
            still_passing=still_passing,
            total_change=total_change,
            pass_rate_change=pass_rate_change,
            coverage_change=coverage_change,
            execution_time_change=execution_time_change
        )
        
        # Cache the comparison
        _cache_comparison(project_id, diff)
        
        return diff
    
    except Exception as e:
        logger.error(f"Failed to compare test runs: {e}")
        return None


def _cache_comparison(project_id: int, diff: TestDiff):
    """Cache comparison results in database."""
    try:
        conn = db.get_db_connection()
        cur = conn.cursor()
        
        import json
        comparison_data = json.dumps(diff.to_dict())
        
        cur.execute("""
            INSERT INTO test_comparisons
            (project_id, base_commit_sha, compare_commit_sha, base_run_id, compare_run_id, comparison_data)
            VALUES (%s, %s, %s, %s, %s, %s::jsonb)
            ON CONFLICT (project_id, base_commit_sha, compare_commit_sha)
            DO UPDATE SET comparison_data = EXCLUDED.comparison_data, created_at = CURRENT_TIMESTAMP
        """, (
            project_id,
            diff.base_run.commit_sha,
            diff.compare_run.commit_sha,
            diff.base_run.run_id,
            diff.compare_run.run_id,
            comparison_data
        ))
        
        conn.commit()
        cur.close()
        db.return_db_connection(conn)
        
        logger.info(f"Cached comparison: {diff.base_run.commit_sha} vs {diff.compare_run.commit_sha}")
    
    except Exception as e:
        logger.error(f"Failed to cache comparison: {e}")


def get_cached_comparison(
    project_id: int,
    base_commit: str,
    compare_commit: str
) -> Optional[Dict[str, Any]]:
    """
    Get cached comparison results.
    
    Args:
        project_id: Project ID
        base_commit: Base commit SHA
        compare_commit: Compare commit SHA
    
    Returns:
        Cached comparison data or None
    """
    try:
        conn = db.get_db_connection()
        cur = conn.cursor()
        
        cur.execute("""
            SELECT comparison_data
            FROM test_comparisons
            WHERE project_id = %s AND base_commit_sha = %s AND compare_commit_sha = %s
        """, (project_id, base_commit, compare_commit))
        
        row = cur.fetchone()
        cur.close()
        db.return_db_connection(conn)
        
        if row:
            return row[0]  # JSONB data
        
        return None
    
    except Exception as e:
        logger.error(f"Failed to get cached comparison: {e}")
        return None


def get_test_trends(project_id: int, days: int = 30) -> Dict[str, Any]:
    """
    Get test result trends over time.
    
    Args:
        project_id: Project ID
        days: Number of days to look back
    
    Returns:
        Trend data including pass rates, coverage, etc.
    """
    try:
        conn = db.get_db_connection()
        cur = conn.cursor()
        
        cur.execute("""
            SELECT 
                DATE(created_at) as date,
                AVG(CAST(passed_tests AS FLOAT) / NULLIF(total_tests, 0) * 100) as avg_pass_rate,
                AVG(coverage_percentage) as avg_coverage,
                AVG(execution_time_ms) as avg_execution_time,
                COUNT(*) as run_count
            FROM test_run_history
            WHERE project_id = %s AND created_at >= CURRENT_DATE - INTERVAL '%s days'
            GROUP BY DATE(created_at)
            ORDER BY date DESC
        """, (project_id, days))
        
        trends = []
        for row in cur.fetchall():
            trends.append({
                'date': row[0].isoformat() if row[0] else None,
                'avg_pass_rate': round(float(row[1]), 2) if row[1] else None,
                'avg_coverage': round(float(row[2]), 2) if row[2] else None,
                'avg_execution_time': int(row[3]) if row[3] else None,
                'run_count': row[4]
            })
        
        cur.close()
        db.return_db_connection(conn)
        
        return {
            'project_id': project_id,
            'days': days,
            'data_points': len(trends),
            'trends': list(reversed(trends))  # Chronological order
        }
    
    except Exception as e:
        logger.error(f"Failed to get test trends: {e}")
        return {'error': str(e)}
