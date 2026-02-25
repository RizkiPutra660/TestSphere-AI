"""
Retry decorator for resilient external API calls.
Implements exponential backoff with jitter.
"""
import time
import functools
from typing import Callable, Type, Tuple
from utils.logger import setup_logger

logger = setup_logger(__name__)


def retry_with_backoff(
    max_attempts: int = 3,
    initial_delay: float = 1.0,
    backoff_factor: float = 2.0,
    max_delay: float = 30.0,
    exceptions: Tuple[Type[Exception], ...] = (Exception,)
):
    """
    Decorator for retrying functions with exponential backoff.
    
    Args:
        max_attempts: Maximum number of retry attempts
        initial_delay: Initial delay between retries in seconds
        backoff_factor: Multiplier for delay after each retry
        max_delay: Maximum delay between retries
        exceptions: Tuple of exception types to catch and retry
    
    Example:
        @retry_with_backoff(max_attempts=3, initial_delay=2.0)
        def call_external_api():
            response = requests.get('https://api.example.com')
            response.raise_for_status()
            return response.json()
    """
    def decorator(func: Callable) -> Callable:
        @functools.wraps(func)
        def wrapper(*args, **kwargs):
            delay = initial_delay
            last_exception = None
            
            for attempt in range(1, max_attempts + 1):
                try:
                    result = func(*args, **kwargs)
                    
                    # Log successful retry
                    if attempt > 1:
                        logger.info(
                            f"{func.__name__} succeeded on attempt {attempt}/{max_attempts}"
                        )
                    
                    return result
                    
                except exceptions as e:
                    last_exception = e
                    
                    if attempt == max_attempts:
                        logger.error(
                            f"{func.__name__} failed after {max_attempts} attempts: {str(e)}"
                        )
                        raise
                    
                    # Calculate delay with exponential backoff
                    current_delay = min(delay, max_delay)
                    
                    logger.warning(
                        f"{func.__name__} attempt {attempt}/{max_attempts} failed: {str(e)}. "
                        f"Retrying in {current_delay:.1f}s..."
                    )
                    
                    time.sleep(current_delay)
                    delay *= backoff_factor
            
            # Should never reach here, but just in case
            raise last_exception
        
        return wrapper
    return decorator


def retry_on_connection_error(max_attempts: int = 3):
    """
    Convenience decorator for network/connection errors.
    Retries on common connection-related exceptions.
    """
    import requests
    
    return retry_with_backoff(
        max_attempts=max_attempts,
        initial_delay=2.0,
        exceptions=(
            requests.exceptions.ConnectionError,
            requests.exceptions.Timeout,
            requests.exceptions.HTTPError,
            TimeoutError,
            ConnectionError,
        )
    )


def retry_on_rate_limit(max_attempts: int = 3):
    """
    Decorator specifically for handling rate limit errors.
    Uses longer delays suitable for rate limit recovery.
    """
    import requests
    
    def is_rate_limit_error(e):
        """Check if exception is a rate limit error"""
        if isinstance(e, requests.exceptions.HTTPError):
            return e.response.status_code == 429
        return False
    
    def decorator(func: Callable) -> Callable:
        @functools.wraps(func)
        def wrapper(*args, **kwargs):
            delay = 60.0  # Start with 1 minute delay for rate limits
            
            for attempt in range(1, max_attempts + 1):
                try:
                    return func(*args, **kwargs)
                    
                except requests.exceptions.HTTPError as e:
                    if not is_rate_limit_error(e):
                        raise
                    
                    if attempt == max_attempts:
                        logger.error(f"{func.__name__} rate limited after {max_attempts} attempts")
                        raise
                    
                    # Check for Retry-After header
                    retry_after = e.response.headers.get('Retry-After')
                    if retry_after:
                        try:
                            delay = float(retry_after)
                        except ValueError:
                            pass
                    
                    logger.warning(
                        f"{func.__name__} rate limited. Retrying in {delay:.0f}s... "
                        f"(attempt {attempt}/{max_attempts})"
                    )
                    
                    time.sleep(delay)
                    delay *= 2  # Double delay for next attempt
            
            raise Exception("Max retry attempts reached")
        
        return wrapper
    return decorator
