"""
Caching utilities for improved application performance.

Provides:
- Cache initialization with multiple backend support (Simple, Redis, FileSystem)
- Cache decorators for function memoization
- Cache invalidation helpers
- Cache statistics tracking
"""

import os
import logging
from functools import wraps
from flask_caching import Cache

logger = logging.getLogger(__name__)

# Global cache instance
cache = None

def initialize_cache(app):
    """
    Initialize Flask-Caching with configured backend.
    
    Supports three cache backends:
    1. Simple (In-memory) - Default, good for development
    2. Redis - Recommended for production with multiple workers
    3. FileSystem - Alternative for single-server deployments
    
    Configuration via environment variables:
    - CACHE_TYPE: simple, redis, filesystem (default: simple)
    - CACHE_REDIS_URL: Redis connection URL (for redis backend)
    - CACHE_DIR: Directory for filesystem cache (for filesystem backend)
    - CACHE_DEFAULT_TIMEOUT: Default timeout in seconds (default: 300)
    """
    global cache
    
    cache_type = os.getenv('CACHE_TYPE', 'simple').lower()
    default_timeout = int(os.getenv('CACHE_DEFAULT_TIMEOUT', '300'))
    
    config = {
        'CACHE_DEFAULT_TIMEOUT': default_timeout,
    }
    
    if cache_type == 'redis':
        redis_url = os.getenv('CACHE_REDIS_URL', 'redis://localhost:6379/0')
        config['CACHE_TYPE'] = 'redis'
        config['CACHE_REDIS_URL'] = redis_url
        config['CACHE_KEY_PREFIX'] = 'genai_qa_'
        logger.info(f"Initializing Redis cache: {redis_url}")
        
    elif cache_type == 'filesystem':
        cache_dir = os.getenv('CACHE_DIR', '/tmp/genai_qa_cache')
        config['CACHE_TYPE'] = 'filesystem'
        config['CACHE_DIR'] = cache_dir
        config['CACHE_THRESHOLD'] = 1000  # Max items before cleanup
        logger.info(f"Initializing FileSystem cache: {cache_dir}")
        
    else:
        # Simple in-memory cache (default)
        config['CACHE_TYPE'] = 'simple'
        config['CACHE_THRESHOLD'] = 500  # Max items in memory
        logger.info("Initializing Simple (in-memory) cache")
    
    cache = Cache(app, config=config)
    logger.info(f"Cache initialized successfully (type={cache_type}, timeout={default_timeout}s)")
    
    return cache


def get_cache():
    """Get the global cache instance."""
    return cache


def cache_key(*args, **kwargs):
    """
    Generate a cache key from function arguments.
    
    Usage:
        key = cache_key('user', user_id=123)
        # Returns: 'user:user_id=123'
    """
    parts = [str(arg) for arg in args]
    parts.extend([f"{k}={v}" for k, v in sorted(kwargs.items())])
    return ':'.join(parts)


def invalidate_cache_pattern(pattern):
    """
    Invalidate all cache keys matching a pattern.
    
    Note: Pattern matching only works with Redis backend.
    For simple cache, use cache.clear() to clear all.
    
    Args:
        pattern: Pattern to match (e.g., 'user:*', 'project:123:*')
    """
    if cache is None:
        logger.warning("Cache not initialized, cannot invalidate")
        return
    
    try:
        # Redis backend supports pattern deletion
        if hasattr(cache.cache, '_write_client'):
            redis_client = cache.cache._write_client
            keys = redis_client.keys(f"genai_qa_{pattern}")
            if keys:
                redis_client.delete(*keys)
                logger.info(f"Invalidated {len(keys)} cache keys matching pattern: {pattern}")
        else:
            # For simple/filesystem cache, clear all
            cache.clear()
            logger.info(f"Cache cleared (pattern matching not supported for current backend)")
    except Exception as e:
        logger.exception(f"Error invalidating cache pattern '{pattern}': {e}")


def cache_response(timeout=300, key_prefix=None, query_string=False):
    """
    Decorator to cache Flask route responses.
    
    Args:
        timeout: Cache timeout in seconds (default: 300)
        key_prefix: Custom key prefix (default: view name)
        query_string: Include query string in cache key (default: False)
    
    Usage:
        @app.route('/api/projects')
        @cache_response(timeout=600, query_string=True)
        def get_projects():
            # ... expensive operation
            return jsonify(projects)
    """
    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            if cache is None:
                # Cache not initialized, skip caching
                return f(*args, **kwargs)
            
            # Build cache key
            cache_key_parts = [key_prefix or f.__name__]
            
            if query_string:
                from flask import request
                if request.query_string:
                    cache_key_parts.append(request.query_string.decode('utf-8'))
            
            if args:
                cache_key_parts.extend([str(arg) for arg in args])
            if kwargs:
                cache_key_parts.extend([f"{k}={v}" for k, v in sorted(kwargs.items())])
            
            cache_key_str = ':'.join(cache_key_parts)
            
            # Try to get from cache
            cached = cache.get(cache_key_str)
            if cached is not None:
                logger.debug(f"Cache hit: {cache_key_str}")
                return cached
            
            # Execute function and cache result
            logger.debug(f"Cache miss: {cache_key_str}")
            result = f(*args, **kwargs)
            cache.set(cache_key_str, result, timeout=timeout)
            
            return result
        
        return decorated_function
    return decorator


def cached_query(timeout=300, key_func=None):
    """
    Decorator to cache database query results.
    
    Args:
        timeout: Cache timeout in seconds (default: 300)
        key_func: Function to generate cache key from arguments
    
    Usage:
        @cached_query(timeout=600, key_func=lambda user_id: f'user:{user_id}')
        def get_user_by_id(user_id):
            # ... database query
            return user_data
    """
    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            if cache is None:
                return f(*args, **kwargs)
            
            # Generate cache key
            if key_func:
                cache_key_str = key_func(*args, **kwargs)
            else:
                cache_key_str = f"{f.__name__}:{cache_key(*args, **kwargs)}"
            
            # Try to get from cache
            cached = cache.get(cache_key_str)
            if cached is not None:
                logger.debug(f"Query cache hit: {cache_key_str}")
                return cached
            
            # Execute query and cache result
            logger.debug(f"Query cache miss: {cache_key_str}")
            result = f(*args, **kwargs)
            cache.set(cache_key_str, result, timeout=timeout)
            
            return result
        
        return decorated_function
    return decorator


def get_cache_stats():
    """
    Get cache statistics (if available).
    
    Returns:
        dict: Cache statistics or None
    """
    if cache is None:
        return None
    
    try:
        stats = {
            'backend': cache.config.get('CACHE_TYPE', 'unknown'),
            'timeout': cache.config.get('CACHE_DEFAULT_TIMEOUT', 300),
        }
        
        # Redis-specific stats
        if hasattr(cache.cache, '_write_client'):
            redis_client = cache.cache._write_client
            info = redis_client.info('stats')
            stats['redis'] = {
                'total_commands': info.get('total_commands_processed', 0),
                'keyspace_hits': info.get('keyspace_hits', 0),
                'keyspace_misses': info.get('keyspace_misses', 0),
                'connected_clients': info.get('connected_clients', 0),
            }
            
            # Calculate hit rate
            hits = info.get('keyspace_hits', 0)
            misses = info.get('keyspace_misses', 0)
            total = hits + misses
            if total > 0:
                stats['redis']['hit_rate'] = round((hits / total) * 100, 2)
        
        return stats
    except Exception as e:
        logger.exception(f"Error getting cache stats: {e}")
        return None


# Cache invalidation helpers for specific entities
def invalidate_user_cache(user_id):
    """Invalidate all cache entries for a specific user."""
    invalidate_cache_pattern(f'user:{user_id}:*')
    invalidate_cache_pattern(f'*user_id={user_id}*')


def invalidate_project_cache(project_id):
    """Invalidate all cache entries for a specific project."""
    invalidate_cache_pattern(f'project:{project_id}:*')
    invalidate_cache_pattern(f'*project_id={project_id}*')


def invalidate_test_cache(test_id):
    """Invalidate all cache entries for a specific test."""
    invalidate_cache_pattern(f'test:{test_id}:*')
    invalidate_cache_pattern(f'*test_id={test_id}*')


def warm_cache():
    """
    Warm up cache with frequently accessed data.
    Call this during application startup or after cache clear.
    """
    # This can be implemented to pre-populate cache with common queries
    logger.info("Cache warming not implemented yet")
    pass
