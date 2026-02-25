"""
Application metrics and monitoring utilities.
Tracks request timing, error rates, and system health.
"""
import time
import functools
from typing import Dict, List
from datetime import datetime, timedelta
from collections import defaultdict, deque
from threading import Lock
from utils.logger import setup_logger

logger = setup_logger(__name__)


class MetricsCollector:
    """Thread-safe metrics collector for application monitoring"""
    
    def __init__(self, retention_minutes: int = 60):
        """
        Initialize metrics collector.
        
        Args:
            retention_minutes: How long to retain metrics in memory
        """
        self._lock = Lock()
        self._retention_minutes = retention_minutes
        
        # Request metrics
        self._request_times: Dict[str, deque] = defaultdict(lambda: deque(maxlen=1000))
        self._request_counts: Dict[str, int] = defaultdict(int)
        self._error_counts: Dict[str, int] = defaultdict(int)
        
        # System metrics
        self._start_time = datetime.now()
        self._total_requests = 0
        self._total_errors = 0
    
    def record_request(self, endpoint: str, duration: float, success: bool = True):
        """
        Record request metrics.
        
        Args:
            endpoint: API endpoint path
            duration: Request duration in seconds
            success: Whether request succeeded
        """
        with self._lock:
            self._request_times[endpoint].append({
                'timestamp': datetime.now(),
                'duration': duration,
                'success': success
            })
            
            self._request_counts[endpoint] += 1
            self._total_requests += 1
            
            if not success:
                self._error_counts[endpoint] += 1
                self._total_errors += 1
    
    def record_error(self, endpoint: str, error_type: str):
        """Record error occurrence"""
        with self._lock:
            error_key = f"{endpoint}:{error_type}"
            self._error_counts[error_key] += 1
            self._total_errors += 1
    
    def get_endpoint_stats(self, endpoint: str) -> Dict:
        """Get statistics for a specific endpoint"""
        with self._lock:
            times = self._request_times.get(endpoint, deque())
            
            if not times:
                return {
                    'endpoint': endpoint,
                    'count': 0,
                    'avg_duration': 0,
                    'min_duration': 0,
                    'max_duration': 0,
                    'error_rate': 0
                }
            
            # Filter recent times
            cutoff = datetime.now() - timedelta(minutes=self._retention_minutes)
            recent = [t for t in times if t['timestamp'] > cutoff]
            
            if not recent:
                return {
                    'endpoint': endpoint,
                    'count': 0,
                    'avg_duration': 0,
                    'min_duration': 0,
                    'max_duration': 0,
                    'error_rate': 0
                }
            
            durations = [t['duration'] for t in recent]
            errors = sum(1 for t in recent if not t['success'])
            
            return {
                'endpoint': endpoint,
                'count': len(recent),
                'avg_duration': sum(durations) / len(durations),
                'min_duration': min(durations),
                'max_duration': max(durations),
                'p95_duration': self._percentile(durations, 0.95),
                'p99_duration': self._percentile(durations, 0.99),
                'error_rate': errors / len(recent) if recent else 0,
                'errors': errors
            }
    
    def get_all_stats(self) -> Dict:
        """Get statistics for all endpoints"""
        with self._lock:
            endpoints = list(self._request_times.keys())
        
        return {
            'endpoints': {ep: self.get_endpoint_stats(ep) for ep in endpoints},
            'global': self.get_global_stats()
        }
    
    def get_global_stats(self) -> Dict:
        """Get global application statistics"""
        with self._lock:
            uptime = datetime.now() - self._start_time
            
            return {
                'uptime_seconds': uptime.total_seconds(),
                'total_requests': self._total_requests,
                'total_errors': self._total_errors,
                'error_rate': self._total_errors / self._total_requests if self._total_requests > 0 else 0,
                'requests_per_minute': self._calculate_rpm()
            }
    
    def _calculate_rpm(self) -> float:
        """Calculate requests per minute"""
        cutoff = datetime.now() - timedelta(minutes=1)
        count = 0
        
        for endpoint_times in self._request_times.values():
            count += sum(1 for t in endpoint_times if t['timestamp'] > cutoff)
        
        return count
    
    @staticmethod
    def _percentile(values: List[float], percentile: float) -> float:
        """Calculate percentile of values"""
        if not values:
            return 0
        
        sorted_values = sorted(values)
        index = int(len(sorted_values) * percentile)
        return sorted_values[min(index, len(sorted_values) - 1)]
    
    def reset(self):
        """Reset all metrics"""
        with self._lock:
            self._request_times.clear()
            self._request_counts.clear()
            self._error_counts.clear()
            self._start_time = datetime.now()
            self._total_requests = 0
            self._total_errors = 0


# Global metrics collector instance
_metrics = MetricsCollector()


def get_metrics_collector() -> MetricsCollector:
    """Get the global metrics collector instance"""
    return _metrics


def track_request_metrics(endpoint_name: str = None):
    """
    Decorator to track request timing and success rate.
    
    Args:
        endpoint_name: Optional custom endpoint name (defaults to function name)
    
    Example:
        @track_request_metrics('generate_tests')
        def generate_tests():
            # ... endpoint logic
            pass
    """
    def decorator(func):
        @functools.wraps(func)
        def wrapper(*args, **kwargs):
            endpoint = endpoint_name or func.__name__
            start_time = time.time()
            success = True
            
            try:
                result = func(*args, **kwargs)
                return result
                
            except Exception as e:
                success = False
                _metrics.record_error(endpoint, type(e).__name__)
                raise
                
            finally:
                duration = time.time() - start_time
                _metrics.record_request(endpoint, duration, success)
                
                if duration > 5.0:  # Log slow requests
                    logger.warning(
                        f"Slow request: {endpoint} took {duration:.2f}s"
                    )
        
        return wrapper
    return decorator
