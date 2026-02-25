"""
API Versioning Support for GenAI-QA

Provides URL-based API versioning with backward compatibility.
Supports: /api/v1/*, /api/v2/*, etc.
"""

from flask import Blueprint, request, jsonify
from functools import wraps
from typing import Callable, Optional
import re


# Current API version
CURRENT_API_VERSION = "v1"
SUPPORTED_VERSIONS = ["v1"]  # Will expand to ["v1", "v2"] when v2 is ready


def extract_version_from_path(path: str) -> Optional[str]:
    """
    Extract API version from URL path.
    
    Args:
        path: URL path (e.g., '/api/v1/users')
    
    Returns:
        Version string (e.g., 'v1') or None
    """
    match = re.search(r'/api/v(\d+)/', path)
    if match:
        return f"v{match.group(1)}"
    return None


def requires_version(supported_versions: list = None):
    """
    Decorator to enforce API version requirements.
    
    Args:
        supported_versions: List of supported versions for this endpoint
    
    Usage:
        @app.route('/api/v1/users')
        @requires_version(['v1'])
        def get_users():
            # ...
    """
    if supported_versions is None:
        supported_versions = SUPPORTED_VERSIONS
    
    def decorator(func: Callable) -> Callable:
        @wraps(func)
        def wrapper(*args, **kwargs):
            version = extract_version_from_path(request.path)
            
            if version not in supported_versions:
                return jsonify({
                    'error': 'Unsupported API version',
                    'code': 'VERSION_NOT_SUPPORTED',
                    'supported_versions': supported_versions,
                    'requested_version': version
                }), 400
            
            # Add version to request context
            request.api_version = version
            
            return func(*args, **kwargs)
        
        return wrapper
    return decorator


def create_versioned_blueprint(
    name: str,
    version: str,
    import_name: str,
    **kwargs
) -> Blueprint:
    """
    Create a Blueprint with version prefix.
    
    Args:
        name: Blueprint name
        version: API version (e.g., 'v1')
        import_name: Module name
        **kwargs: Additional Blueprint arguments
    
    Returns:
        Blueprint with version prefix
    
    Usage:
        users_bp_v1 = create_versioned_blueprint('users', 'v1', __name__)
        
        @users_bp_v1.route('/users')
        def get_users():
            # Accessible at /api/v1/users
    """
    url_prefix = kwargs.pop('url_prefix', '')
    full_prefix = f'/api/{version}{url_prefix}'
    
    return Blueprint(
        f"{name}_{version}",
        import_name,
        url_prefix=full_prefix,
        **kwargs
    )


class APIVersion:
    """
    Context manager for version-specific logic.
    
    Usage:
        @app.route('/api/<version>/users')
        def get_users(version):
            with APIVersion(version) as v:
                if v.is_version('v1'):
                    return old_response_format()
                elif v.is_version('v2'):
                    return new_response_format()
    """
    
    def __init__(self, version: str):
        self.version = version
        self.major = int(version[1:]) if version.startswith('v') else 0
    
    def __enter__(self):
        return self
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        pass
    
    def is_version(self, version: str) -> bool:
        """Check if current version matches"""
        return self.version == version
    
    def is_at_least(self, version: str) -> bool:
        """Check if current version >= specified version"""
        target_major = int(version[1:]) if version.startswith('v') else 0
        return self.major >= target_major
    
    def is_below(self, version: str) -> bool:
        """Check if current version < specified version"""
        target_major = int(version[1:]) if version.startswith('v') else 0
        return self.major < target_major


def deprecate_endpoint(
    deprecated_in: str,
    removed_in: str,
    replacement: str = None
):
    """
    Mark an endpoint as deprecated.
    
    Args:
        deprecated_in: Version when deprecated (e.g., 'v2')
        removed_in: Version when it will be removed (e.g., 'v3')
        replacement: Suggested replacement endpoint
    
    Usage:
        @app.route('/api/v1/old-endpoint')
        @deprecate_endpoint('v2', 'v3', '/api/v2/new-endpoint')
        def old_endpoint():
            # ...
    """
    def decorator(func: Callable) -> Callable:
        @wraps(func)
        def wrapper(*args, **kwargs):
            version = getattr(request, 'api_version', None) or extract_version_from_path(request.path)
            
            # Add deprecation headers
            response = func(*args, **kwargs)
            
            if hasattr(response, 'headers'):
                response.headers['X-API-Deprecated'] = 'true'
                response.headers['X-API-Deprecated-Since'] = deprecated_in
                response.headers['X-API-Remove-Version'] = removed_in
                if replacement:
                    response.headers['X-API-Replacement'] = replacement
            
            return response
        
        return wrapper
    return decorator


# ============================================================================
# Migration helpers for transitioning between versions
# ============================================================================

class ResponseTransformer:
    """
    Transform responses between API versions.
    
    Usage:
        transformer = ResponseTransformer()
        
        @app.route('/api/<version>/users')
        def get_users(version):
            # Generate v2 response
            data = {'users': [...], 'pagination': {...}}
            
            # Transform to v1 if needed
            return transformer.transform(data, version, 'v1_user_list')
    """
    
    def __init__(self):
        self.transformers = {}
    
    def register(self, name: str, from_version: str, to_version: str):
        """
        Register a transformation function.
        
        Usage:
            @transformer.register('user_list', 'v2', 'v1')
            def transform_user_list(data):
                # Convert v2 format to v1 format
                return {
                    'users': data['data']['items'],
                    'total': data['meta']['total']
                }
        """
        def decorator(func: Callable) -> Callable:
            key = f"{name}:{from_version}->{to_version}"
            self.transformers[key] = func
            return func
        return decorator
    
    def transform(self, data: dict, target_version: str, transform_name: str):
        """Apply transformation if needed"""
        current_version = getattr(request, 'api_version', CURRENT_API_VERSION)
        
        if current_version == target_version:
            return data
        
        key = f"{transform_name}:{current_version}->{target_version}"
        transformer_func = self.transformers.get(key)
        
        if transformer_func:
            return transformer_func(data)
        
        return data


# Global transformer instance
transformer = ResponseTransformer()


# ============================================================================
# Example: Version-specific route implementations
# ============================================================================

def setup_versioned_routes(app):
    """
    Example of setting up versioned routes.
    
    This shows how to:
    1. Create version-specific blueprints
    2. Handle version differences
    3. Migrate between versions
    """
    
    # V1 Routes (current)
    users_v1 = create_versioned_blueprint('users', 'v1', __name__)
    
    @users_v1.route('/users')
    def get_users_v1():
        """V1: Simple list format"""
        return {
            'users': [
                {'id': 1, 'name': 'John'},
                {'id': 2, 'name': 'Jane'}
            ],
            'count': 2
        }
    
    # V2 Routes (future - when ready)
    # users_v2 = create_versioned_blueprint('users', 'v2', __name__)
    #
    # @users_v2.route('/users')
    # def get_users_v2():
    #     """V2: Enhanced format with pagination and links"""
    #     return APIResponse.paginated(
    #         items=[
    #             {'id': 1, 'name': 'John', 'email': 'john@example.com'},
    #             {'id': 2, 'name': 'Jane', 'email': 'jane@example.com'}
    #         ],
    #         page=1,
    #         per_page=20,
    #         total_items=2,
    #         endpoint='users.get_users_v2'
    #     )
    
    # Register blueprints
    app.register_blueprint(users_v1)
    # app.register_blueprint(users_v2)  # Uncomment when v2 is ready


# ============================================================================
# Version negotiation via headers (alternative approach)
# ============================================================================

def version_from_header(default: str = CURRENT_API_VERSION) -> str:
    """
    Get API version from Accept header.
    
    Supports:
        Accept: application/vnd.genai-qa.v1+json
        X-API-Version: v1
    
    Returns:
        Version string (e.g., 'v1')
    """
    # Check X-API-Version header
    version = request.headers.get('X-API-Version')
    if version and version in SUPPORTED_VERSIONS:
        return version
    
    # Check Accept header
    accept = request.headers.get('Accept', '')
    match = re.search(r'vnd\.genai-qa\.v(\d+)', accept)
    if match:
        version = f"v{match.group(1)}"
        if version in SUPPORTED_VERSIONS:
            return version
    
    return default


def add_version_headers(response):
    """
    Add version information to response headers.
    
    Usage:
        @app.after_request
        def after_request(response):
            return add_version_headers(response)
    """
    if hasattr(response, 'headers'):
        version = getattr(request, 'api_version', None) or extract_version_from_path(request.path)
        if version:
            response.headers['X-API-Version'] = version
            response.headers['X-API-Current-Version'] = CURRENT_API_VERSION
            response.headers['X-API-Supported-Versions'] = ','.join(SUPPORTED_VERSIONS)
    
    return response


# ============================================================================
# Documentation
# ============================================================================

"""
API Versioning Strategy
========================

1. URL-Based Versioning (Primary):
   - Format: /api/v1/resource, /api/v2/resource
   - Explicit and clear
   - Easy to test and debug
   - Recommended for GenAI-QA

2. Header-Based Versioning (Alternative):
   - Format: X-API-Version: v1
   - Format: Accept: application/vnd.genai-qa.v1+json
   - More RESTful
   - Harder to test in browser

Current Implementation:
-----------------------
- Active Version: v1
- All routes prefixed with /api/v1/
- Use create_versioned_blueprint() for new blueprints
- Use @requires_version() decorator for version enforcement

Migration Path:
---------------
When introducing v2:
1. Keep all v1 routes functional
2. Create new v2 blueprints
3. Add @deprecate_endpoint() to v1 routes being replaced
4. Use ResponseTransformer for backward compatibility
5. Document migration guide
6. Set sunset date for v1

Breaking Changes Policy:
------------------------
- Increment major version for breaking changes
- Maintain at least 2 versions simultaneously
- Provide 6-month deprecation notice
- Add deprecation headers to old endpoints

Example Timeline:
-----------------
v1.0 (Current):
- Initial API release
- All features available at /api/v1/*

v2.0 (Future):
- Breaking changes (new response format)
- Available at /api/v2/*
- v1 marked as deprecated
- Both versions supported

v3.0 (Later):
- v1 removed
- Only v2 and v3 supported
"""
