"""
Standardized API response format utilities.

Provides consistent response structure across all endpoints:
- Success responses
- Error responses  
- Paginated responses
- Metadata inclusion
- HATEOAS links
"""

from typing import Any, Dict, List, Optional, Union
from flask import jsonify, request, url_for
from datetime import datetime
import logging

logger = logging.getLogger(__name__)


class APIResponse:
    """
    Standardized API response builder.
    
    All API responses follow this structure:
    {
        "success": true/false,
        "data": {...},              # For success responses
        "error": {...},             # For error responses
        "meta": {...},              # Metadata (pagination, timing, etc.)
        "links": {...}              # HATEOAS links
    }
    """
    
    @staticmethod
    def success(
        data: Any = None,
        message: str = None,
        meta: Dict[str, Any] = None,
        links: Dict[str, str] = None,
        status_code: int = 200
    ):
        """
        Create a success response.
        
        Args:
            data: Response data (dict, list, or primitive)
            message: Optional success message
            meta: Optional metadata
            links: Optional HATEOAS links
            status_code: HTTP status code (default: 200)
        
        Returns:
            Flask JSON response
        
        Example:
            return APIResponse.success(
                data={'user': user_data},
                message='User created successfully',
                status_code=201
            )
        """
        response = {
            'success': True,
            'timestamp': datetime.utcnow().isoformat() + 'Z'
        }
        
        if message:
            response['message'] = message
        
        if data is not None:
            response['data'] = data
        
        if meta:
            response['meta'] = meta
        
        if links:
            response['links'] = links
        
        return jsonify(response), status_code
    
    @staticmethod
    def error(
        message: str,
        error_code: str = None,
        details: Any = None,
        status_code: int = 400
    ):
        """
        Create an error response.
        
        Args:
            message: Error message (human-readable)
            error_code: Machine-readable error code
            details: Additional error details
            status_code: HTTP status code (default: 400)
        
        Returns:
            Flask JSON response
        
        Example:
            return APIResponse.error(
                message='User not found',
                error_code='USER_NOT_FOUND',
                status_code=404
            )
        """
        response = {
            'success': False,
            'timestamp': datetime.utcnow().isoformat() + 'Z',
            'error': {
                'message': message
            }
        }
        
        if error_code:
            response['error']['code'] = error_code
        
        if details:
            response['error']['details'] = details
        
        # Add request info for debugging
        response['error']['path'] = request.path
        response['error']['method'] = request.method
        
        return jsonify(response), status_code
    
    @staticmethod
    def paginated(
        items: List[Any],
        page: int,
        per_page: int,
        total_items: int,
        endpoint: str = None,
        **url_params
    ):
        """
        Create a paginated response with HATEOAS links.
        
        Args:
            items: List of items for current page
            page: Current page number
            per_page: Items per page
            total_items: Total number of items
            endpoint: Flask endpoint name for generating links
            **url_params: Additional URL parameters
        
        Returns:
            Flask JSON response
        
        Example:
            return APIResponse.paginated(
                items=users,
                page=2,
                per_page=20,
                total_items=156,
                endpoint='users.get_users'
            )
        """
        total_pages = (total_items + per_page - 1) // per_page if total_items > 0 else 0
        
        meta = {
            'pagination': {
                'page': page,
                'per_page': per_page,
                'total_items': total_items,
                'total_pages': total_pages,
                'has_prev': page > 1,
                'has_next': page < total_pages
            }
        }
        
        links = {}
        if endpoint:
            # Generate HATEOAS links
            base_params = {**url_params, 'per_page': per_page}
            
            links['self'] = url_for(endpoint, page=page, **base_params, _external=True)
            links['first'] = url_for(endpoint, page=1, **base_params, _external=True)
            links['last'] = url_for(endpoint, page=max(1, total_pages), **base_params, _external=True)
            
            if page > 1:
                links['prev'] = url_for(endpoint, page=page-1, **base_params, _external=True)
            
            if page < total_pages:
                links['next'] = url_for(endpoint, page=page+1, **base_params, _external=True)
        
        return APIResponse.success(
            data={'items': items},
            meta=meta,
            links=links if links else None
        )
    
    @staticmethod
    def created(data: Any, resource_id: Any = None, location: str = None):
        """
        Create a 201 Created response.
        
        Args:
            data: Created resource data
            resource_id: ID of created resource
            location: URL of created resource
        
        Returns:
            Flask JSON response with 201 status
        
        Example:
            return APIResponse.created(
                data={'user': user_data},
                resource_id=user_id,
                location=url_for('users.get_user', user_id=user_id)
            )
        """
        links = {}
        if location:
            links['self'] = location
        
        meta = {}
        if resource_id:
            meta['resource_id'] = resource_id
        
        return APIResponse.success(
            data=data,
            message='Resource created successfully',
            meta=meta if meta else None,
            links=links if links else None,
            status_code=201
        )
    
    @staticmethod
    def no_content():
        """
        Create a 204 No Content response.
        
        Used for successful DELETE operations or updates with no return value.
        
        Returns:
            Flask response with 204 status
        """
        return '', 204
    
    @staticmethod
    def accepted(data: Any = None, task_id: str = None):
        """
        Create a 202 Accepted response.
        
        Used for async operations that are queued for processing.
        
        Args:
            data: Optional data
            task_id: ID of queued task
        
        Returns:
            Flask JSON response with 202 status
        
        Example:
            return APIResponse.accepted(
                task_id='task-123',
                data={'status': 'queued'}
            )
        """
        meta = {}
        if task_id:
            meta['task_id'] = task_id
        
        return APIResponse.success(
            data=data,
            message='Request accepted for processing',
            meta=meta if meta else None,
            status_code=202
        )


class ErrorCodes:
    """
    Standard error codes for consistent error handling.
    
    Usage:
        return APIResponse.error(
            message='User not found',
            error_code=ErrorCodes.NOT_FOUND,
            status_code=404
        )
    """
    
    # Client Errors (4xx)
    BAD_REQUEST = 'BAD_REQUEST'
    UNAUTHORIZED = 'UNAUTHORIZED'
    FORBIDDEN = 'FORBIDDEN'
    NOT_FOUND = 'NOT_FOUND'
    METHOD_NOT_ALLOWED = 'METHOD_NOT_ALLOWED'
    CONFLICT = 'CONFLICT'
    VALIDATION_ERROR = 'VALIDATION_ERROR'
    UNPROCESSABLE_ENTITY = 'UNPROCESSABLE_ENTITY'
    RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED'
    
    # Authentication/Authorization
    INVALID_TOKEN = 'INVALID_TOKEN'
    EXPIRED_TOKEN = 'EXPIRED_TOKEN'
    MISSING_TOKEN = 'MISSING_TOKEN'
    INVALID_CREDENTIALS = 'INVALID_CREDENTIALS'
    INSUFFICIENT_PERMISSIONS = 'INSUFFICIENT_PERMISSIONS'
    
    # Resource Errors
    RESOURCE_NOT_FOUND = 'RESOURCE_NOT_FOUND'
    RESOURCE_ALREADY_EXISTS = 'RESOURCE_ALREADY_EXISTS'
    RESOURCE_LOCKED = 'RESOURCE_LOCKED'
    
    # Server Errors (5xx)
    INTERNAL_SERVER_ERROR = 'INTERNAL_SERVER_ERROR'
    SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE'
    DATABASE_ERROR = 'DATABASE_ERROR'
    EXTERNAL_SERVICE_ERROR = 'EXTERNAL_SERVICE_ERROR'
    
    # Business Logic Errors
    INVALID_OPERATION = 'INVALID_OPERATION'
    DEPENDENCY_ERROR = 'DEPENDENCY_ERROR'
    QUOTA_EXCEEDED = 'QUOTA_EXCEEDED'


class HTTPStatus:
    """HTTP status codes for reference."""
    
    # Success
    OK = 200
    CREATED = 201
    ACCEPTED = 202
    NO_CONTENT = 204
    
    # Client Errors
    BAD_REQUEST = 400
    UNAUTHORIZED = 401
    FORBIDDEN = 403
    NOT_FOUND = 404
    METHOD_NOT_ALLOWED = 405
    CONFLICT = 409
    UNPROCESSABLE_ENTITY = 422
    TOO_MANY_REQUESTS = 429
    
    # Server Errors
    INTERNAL_SERVER_ERROR = 500
    SERVICE_UNAVAILABLE = 503


def wrap_response(func):
    """
    Decorator to automatically wrap function returns in APIResponse format.
    
    Usage:
        @app.route('/users')
        @wrap_response
        def get_users():
            return users  # Automatically wrapped in success response
    """
    from functools import wraps
    
    @wraps(func)
    def wrapper(*args, **kwargs):
        try:
            result = func(*args, **kwargs)
            
            # If already a Response object, return as-is
            if hasattr(result, 'get_json'):
                return result
            
            # If tuple (data, status_code), wrap data
            if isinstance(result, tuple):
                data, status_code = result
                return APIResponse.success(data=data, status_code=status_code)
            
            # Otherwise wrap as success
            return APIResponse.success(data=result)
            
        except Exception as e:
            logger.exception(f"Error in {func.__name__}: {e}")
            return APIResponse.error(
                message=str(e),
                error_code=ErrorCodes.INTERNAL_SERVER_ERROR,
                status_code=HTTPStatus.INTERNAL_SERVER_ERROR
            )
    
    return wrapper


def validate_request_json(required_fields: List[str] = None, optional_fields: List[str] = None):
    """
    Decorator to validate request JSON data.
    
    Args:
        required_fields: List of required field names
        optional_fields: List of optional field names
    
    Usage:
        @app.route('/users', methods=['POST'])
        @validate_request_json(required_fields=['email', 'password'])
        def create_user():
            data = request.json
            # ... process data
    """
    from functools import wraps
    
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            if not request.is_json:
                return APIResponse.error(
                    message='Request must be JSON',
                    error_code=ErrorCodes.BAD_REQUEST,
                    status_code=HTTPStatus.BAD_REQUEST
                )
            
            data = request.json
            
            if required_fields:
                missing_fields = [field for field in required_fields if field not in data]
                if missing_fields:
                    return APIResponse.error(
                        message='Missing required fields',
                        error_code=ErrorCodes.VALIDATION_ERROR,
                        details={'missing_fields': missing_fields},
                        status_code=HTTPStatus.BAD_REQUEST
                    )
            
            if optional_fields is not None:
                allowed_fields = set(required_fields or []) | set(optional_fields)
                extra_fields = [field for field in data.keys() if field not in allowed_fields]
                if extra_fields:
                    return APIResponse.error(
                        message='Unknown fields in request',
                        error_code=ErrorCodes.VALIDATION_ERROR,
                        details={'unknown_fields': extra_fields},
                        status_code=HTTPStatus.BAD_REQUEST
                    )
            
            return func(*args, **kwargs)
        
        return wrapper
    return decorator


def add_response_headers(headers: Dict[str, str]):
    """
    Decorator to add custom headers to response.
    
    Usage:
        @app.route('/data')
        @add_response_headers({'Cache-Control': 'no-cache'})
        def get_data():
            return data
    """
    from functools import wraps
    
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            response = func(*args, **kwargs)
            
            # Handle tuple responses
            if isinstance(response, tuple):
                resp, status_code = response[0], response[1] if len(response) > 1 else 200
                for key, value in headers.items():
                    resp.headers[key] = value
                return resp, status_code
            
            # Handle Response objects
            for key, value in headers.items():
                response.headers[key] = value
            
            return response
        
        return wrapper
    return decorator


# Convenience functions for common responses
def success(data=None, message=None, **kwargs):
    """Shorthand for APIResponse.success()"""
    return APIResponse.success(data=data, message=message, **kwargs)


def error(message, **kwargs):
    """Shorthand for APIResponse.error()"""
    return APIResponse.error(message=message, **kwargs)


def paginated(items, page, per_page, total_items, **kwargs):
    """Shorthand for APIResponse.paginated()"""
    return APIResponse.paginated(items=items, page=page, per_page=per_page, total_items=total_items, **kwargs)


def created(data, **kwargs):
    """Shorthand for APIResponse.created()"""
    return APIResponse.created(data=data, **kwargs)


def no_content():
    """Shorthand for APIResponse.no_content()"""
    return APIResponse.no_content()


def accepted(data=None, task_id=None):
    """Shorthand for APIResponse.accepted()"""
    return APIResponse.accepted(data=data, task_id=task_id)


# ============================================================================
# ERROR HANDLING UTILITIES (Consolidated from error_handlers.py)
# ============================================================================

from werkzeug.exceptions import HTTPException


def error_response(
    message: str,
    status_code: int = 400,
    details: Optional[Dict[str, Any]] = None
):
    """
    Create a standardized error response.
    Legacy function for backward compatibility.
    
    Args:
        message: Human-readable error message
        status_code: HTTP status code
        details: Optional additional error details
    
    Returns:
        Flask JSON response tuple
    """
    response = {
        'error': message,
        'status': status_code
    }
    
    if details:
        response['details'] = details
    
    # Log error for monitoring
    if status_code >= 500:
        logger.error(f"Server error: {message}", extra={'details': details})
    elif status_code >= 400:
        logger.warning(f"Client error: {message}", extra={'details': details})
    
    return jsonify(response), status_code


def validation_error_response(errors: list):
    """
    Create a validation error response from Pydantic errors.
    
    Args:
        errors: List of Pydantic validation errors
    
    Returns:
        Flask JSON response tuple
    """
    formatted_errors = []
    for error in errors:
        formatted_errors.append({
            'field': '.'.join(str(x) for x in error['loc']),
            'message': error['msg'],
            'type': error['type']
        })
    
    return error_response(
        message='Validation error',
        status_code=422,
        details={'validation_errors': formatted_errors}
    )


def handle_exception(e: Exception, default_message: str = "An error occurred"):
    """
    Handle exceptions and return appropriate error responses.
    
    Args:
        e: Exception instance
        default_message: Default error message if none can be extracted
    
    Returns:
        Flask JSON response tuple
    """
    # Handle HTTP exceptions
    if isinstance(e, HTTPException):
        return error_response(
            message=e.description or default_message,
            status_code=e.code
        )
    
    # Handle other exceptions
    logger.exception(f"Unhandled exception: {str(e)}")
    
    # Don't expose internal error details in production
    return error_response(
        message="Internal server error",
        status_code=500
    )


def success_response(data: Any = None, message: str = None, status_code: int = 200):
    """
    Create a standardized success response.
    Legacy function for backward compatibility.
    
    Args:
        data: Response data
        message: Optional success message
        status_code: HTTP status code
    
    Returns:
        Flask JSON response tuple
    """
    response = {}
    
    if message:
        response['message'] = message
    
    if data is not None:
        response['data'] = data
    
    return jsonify(response), status_code
