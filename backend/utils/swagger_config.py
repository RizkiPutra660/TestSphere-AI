"""
OpenAPI/Swagger documentation configuration for GenAI-QA API.

Provides interactive API documentation accessible at /apidocs
"""

from flasgger import Swagger, swag_from
from flask import Flask
import os


# OpenAPI configuration
swagger_config = {
    "headers": [],
    "specs": [
        {
            "endpoint": 'apispec',
            "route": '/apispec.json',
            "rule_filter": lambda rule: True,
            "model_filter": lambda tag: True,
        }
    ],
    "static_url_path": "/flasgger_static",
    "swagger_ui": True,
    "specs_route": "/apidocs"
}

# OpenAPI template
swagger_template = {
    "swagger": "2.0",
    "info": {
        "title": "GenAI-QA API",
        "description": "AI-Powered QA Automation Platform API - Generate and execute tests using LLMs",
        "contact": {
            "name": "GenAI-QA Team",
            "url": "https://github.com/yourusername/genai-qa",
        },
        "version": "1.0.0",
        "license": {
            "name": "MIT",
            "url": "https://opensource.org/licenses/MIT"
        }
    },
    "host": os.getenv("API_HOST", "localhost:5000"),
    "basePath": "/api",
    "schemes": [
        "http",
        "https"
    ],
    "securityDefinitions": {
        "Bearer": {
            "type": "apiKey",
            "name": "Authorization",
            "in": "header",
            "description": "JWT Authorization header using the Bearer scheme. Example: \"Authorization: Bearer {token}\""
        },
        "CookieAuth": {
            "type": "apiKey",
            "name": "access_token",
            "in": "cookie",
            "description": "JWT token in HTTP-only cookie"
        }
    },
    "tags": [
        {
            "name": "Authentication",
            "description": "User authentication and authorization operations"
        },
        {
            "name": "Users",
            "description": "User management operations"
        },
        {
            "name": "Projects",
            "description": "Project CRUD operations"
        },
        {
            "name": "Tests",
            "description": "Test generation and execution"
        },
        {
            "name": "Scenarios",
            "description": "Test scenario management"
        },
        {
            "name": "Queue",
            "description": "Background job queue operations"
        },
        {
            "name": "Secrets",
            "description": "Secret management for projects"
        },
        {
            "name": "Health",
            "description": "Health checks and monitoring"
        },
        {
            "name": "Database",
            "description": "Database administration operations"
        }
    ],
    "definitions": {
        "Error": {
            "type": "object",
            "properties": {
                "success": {
                    "type": "boolean",
                    "example": False
                },
                "timestamp": {
                    "type": "string",
                    "format": "date-time"
                },
                "error": {
                    "type": "object",
                    "properties": {
                        "message": {
                            "type": "string"
                        },
                        "code": {
                            "type": "string"
                        },
                        "details": {
                            "type": "object"
                        },
                        "path": {
                            "type": "string"
                        },
                        "method": {
                            "type": "string"
                        }
                    }
                }
            }
        },
        "Success": {
            "type": "object",
            "properties": {
                "success": {
                    "type": "boolean",
                    "example": True
                },
                "timestamp": {
                    "type": "string",
                    "format": "date-time"
                },
                "data": {
                    "type": "object"
                },
                "message": {
                    "type": "string"
                },
                "meta": {
                    "type": "object"
                },
                "links": {
                    "type": "object"
                }
            }
        },
        "PaginatedResponse": {
            "type": "object",
            "properties": {
                "success": {
                    "type": "boolean",
                    "example": True
                },
                "data": {
                    "type": "object",
                    "properties": {
                        "items": {
                            "type": "array",
                            "items": {
                                "type": "object"
                            }
                        }
                    }
                },
                "meta": {
                    "type": "object",
                    "properties": {
                        "pagination": {
                            "type": "object",
                            "properties": {
                                "page": {"type": "integer"},
                                "per_page": {"type": "integer"},
                                "total_items": {"type": "integer"},
                                "total_pages": {"type": "integer"},
                                "has_prev": {"type": "boolean"},
                                "has_next": {"type": "boolean"}
                            }
                        }
                    }
                },
                "links": {
                    "type": "object",
                    "properties": {
                        "self": {"type": "string"},
                        "first": {"type": "string"},
                        "last": {"type": "string"},
                        "prev": {"type": "string"},
                        "next": {"type": "string"}
                    }
                }
            }
        },
        "User": {
            "type": "object",
            "properties": {
                "id": {"type": "integer"},
                "username": {"type": "string"},
                "email": {"type": "string", "format": "email"},
                "full_name": {"type": "string"},
                "role": {"type": "string", "enum": ["admin", "user", "moderator"]},
                "is_active": {"type": "boolean"},
                "created_at": {"type": "string", "format": "date-time"},
                "updated_at": {"type": "string", "format": "date-time"}
            }
        },
        "Project": {
            "type": "object",
            "properties": {
                "id": {"type": "integer"},
                "name": {"type": "string"},
                "description": {"type": "string"},
                "user_id": {"type": "integer"},
                "github_repo_url": {"type": "string", "format": "uri"},
                "git_provider": {"type": "string", "enum": ["github", "gitlab"]},
                "default_branch": {"type": "string"},
                "status": {"type": "string"},
                "created_at": {"type": "string", "format": "date-time"},
                "updated_at": {"type": "string", "format": "date-time"}
            }
        },
        "Test": {
            "type": "object",
            "properties": {
                "id": {"type": "integer"},
                "project_id": {"type": "integer"},
                "function_name": {"type": "string"},
                "language": {"type": "string", "enum": ["python", "javascript", "java"]},
                "test_framework": {"type": "string"},
                "status": {"type": "string", "enum": ["pending", "running", "passed", "failed", "error"]},
                "passed_count": {"type": "integer"},
                "failed_count": {"type": "integer"},
                "total_tests": {"type": "integer"},
                "execution_time_ms": {"type": "integer"},
                "created_at": {"type": "string", "format": "date-time"},
                "executed_at": {"type": "string", "format": "date-time"}
            }
        },
        "Scenario": {
            "type": "object",
            "properties": {
                "id": {"type": "integer"},
                "project_id": {"type": "integer"},
                "name": {"type": "string"},
                "description": {"type": "string"},
                "custom_instructions": {"type": "string"},
                "custom_assertions": {"type": "string"},
                "is_active": {"type": "boolean"},
                "created_at": {"type": "string", "format": "date-time"},
                "updated_at": {"type": "string", "format": "date-time"}
            }
        },
        "HealthCheck": {
            "type": "object",
            "properties": {
                "status": {"type": "string", "enum": ["healthy", "degraded", "unhealthy"]},
                "timestamp": {"type": "string", "format": "date-time"},
                "database": {
                    "type": "object",
                    "properties": {
                        "status": {"type": "string"},
                        "response_time_ms": {"type": "number"},
                        "version": {"type": "string"}
                    }
                },
                "llm_service": {
                    "type": "object",
                    "properties": {
                        "status": {"type": "string"},
                        "response_time_ms": {"type": "number"},
                        "provider": {"type": "string"}
                    }
                }
            }
        }
    },
    "responses": {
        "BadRequest": {
            "description": "Bad request - Invalid input",
            "schema": {
                "$ref": "#/definitions/Error"
            }
        },
        "Unauthorized": {
            "description": "Unauthorized - Authentication required",
            "schema": {
                "$ref": "#/definitions/Error"
            }
        },
        "Forbidden": {
            "description": "Forbidden - Insufficient permissions",
            "schema": {
                "$ref": "#/definitions/Error"
            }
        },
        "NotFound": {
            "description": "Not found - Resource does not exist",
            "schema": {
                "$ref": "#/definitions/Error"
            }
        },
        "InternalServerError": {
            "description": "Internal server error",
            "schema": {
                "$ref": "#/definitions/Error"
            }
        }
    }
}


def init_swagger(app: Flask) -> Swagger:
    """
    Initialize Swagger/OpenAPI documentation.
    
    Args:
        app: Flask application instance
    
    Returns:
        Swagger instance
    
    Usage:
        swagger = init_swagger(app)
    """
    swagger = Swagger(app, config=swagger_config, template=swagger_template)
    
    # Add custom configuration
    app.config['SWAGGER'] = {
        'title': 'GenAI-QA API Documentation',
        'uiversion': 3,
        'openapi': '3.0.0'
    }
    
    return swagger


# Decorator for adding Swagger documentation to routes
def document_endpoint(summary: str, tags: list, parameters: list = None, responses: dict = None):
    """
    Decorator to add Swagger documentation to an endpoint.
    
    Args:
        summary: Brief description of endpoint
        tags: List of tags for grouping
        parameters: List of parameter definitions
        responses: Dict of response definitions
    
    Usage:
        @app.route('/users/<int:user_id>')
        @document_endpoint(
            summary='Get user by ID',
            tags=['Users'],
            responses={200: 'User object', 404: 'User not found'}
        )
        def get_user(user_id):
            # ...
    """
    def decorator(func):
        # Build Swagger YAML
        doc = {
            'summary': summary,
            'tags': tags
        }
        
        if parameters:
            doc['parameters'] = parameters
        
        if responses:
            doc['responses'] = responses
        
        return swag_from(doc)(func)
    
    return decorator


# Common parameter definitions for reuse
common_parameters = {
    'page': {
        'name': 'page',
        'in': 'query',
        'type': 'integer',
        'minimum': 1,
        'default': 1,
        'description': 'Page number for pagination'
    },
    'per_page': {
        'name': 'per_page',
        'in': 'query',
        'type': 'integer',
        'minimum': 1,
        'maximum': 100,
        'default': 20,
        'description': 'Items per page'
    },
    'sort_by': {
        'name': 'sort_by',
        'in': 'query',
        'type': 'string',
        'description': 'Field to sort by'
    },
    'order': {
        'name': 'order',
        'in': 'query',
        'type': 'string',
        'enum': ['asc', 'desc'],
        'default': 'asc',
        'description': 'Sort order'
    },
    'id_path': {
        'name': 'id',
        'in': 'path',
        'type': 'integer',
        'required': True,
        'description': 'Resource ID'
    },
    'user_id_path': {
        'name': 'user_id',
        'in': 'path',
        'type': 'integer',
        'required': True,
        'description': 'User ID'
    },
    'project_id_path': {
        'name': 'project_id',
        'in': 'path',
        'type': 'integer',
        'required': True,
        'description': 'Project ID'
    }
}


# Common response definitions
common_responses = {
    200: {
        'description': 'Success',
        'schema': {'$ref': '#/definitions/Success'}
    },
    201: {
        'description': 'Created',
        'schema': {'$ref': '#/definitions/Success'}
    },
    204: {
        'description': 'No Content'
    },
    400: {
        'description': 'Bad Request',
        'schema': {'$ref': '#/definitions/Error'}
    },
    401: {
        'description': 'Unauthorized',
        'schema': {'$ref': '#/definitions/Error'}
    },
    403: {
        'description': 'Forbidden',
        'schema': {'$ref': '#/definitions/Error'}
    },
    404: {
        'description': 'Not Found',
        'schema': {'$ref': '#/definitions/Error'}
    },
    500: {
        'description': 'Internal Server Error',
        'schema': {'$ref': '#/definitions/Error'}
    }
}
