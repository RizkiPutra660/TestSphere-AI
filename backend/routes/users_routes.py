from flask import Blueprint, request, jsonify
import data.database as database
from utils.logger import setup_logger
from utils.api_response import error_response
from utils.api_response import APIResponse, validate_request_json, ErrorCodes
from utils.api_schemas import UserCreate, UserUpdate, UserResponse
from flasgger import swag_from

logger = setup_logger(__name__)
user_bp = Blueprint('users', __name__, url_prefix='/api')

@user_bp.route('/users', methods=['GET'])
@swag_from({
    'tags': ['Users'],
    'summary': 'List all users',
    'description': 'Retrieve a paginated list of users with optional filters',
    'parameters': [
        {
            'name': 'page',
            'in': 'query',
            'type': 'integer',
            'minimum': 1,
            'default': 1,
            'description': 'Page number'
        },
        {
            'name': 'per_page',
            'in': 'query',
            'type': 'integer',
            'minimum': 1,
            'maximum': 100,
            'default': 20,
            'description': 'Items per page'
        },
        {
            'name': 'role',
            'in': 'query',
            'type': 'string',
            'enum': ['admin', 'user', 'moderator'],
            'description': 'Filter by role'
        },
        {
            'name': 'is_active',
            'in': 'query',
            'type': 'boolean',
            'description': 'Filter by active status'
        },
        {
            'name': 'search',
            'in': 'query',
            'type': 'string',
            'description': 'Search by username or email'
        }
    ],
    'responses': {
        200: {
            'description': 'Paginated list of users',
            'schema': {'$ref': '#/definitions/PaginatedResponse'}
        },
        401: {'description': 'Unauthorized', 'schema': {'$ref': '#/definitions/Error'}},
        500: {'description': 'Internal server error', 'schema': {'$ref': '#/definitions/Error'}}
    },
    'security': [{'Bearer': []}]
})
def get_users():
    try:
        logger.info("Fetching users from database")
        
        # Get pagination parameters
        page = request.args.get('page', 1, type=int)
        per_page = request.args.get('per_page', 20, type=int)
        per_page = min(per_page, 100)  # Cap at 100
        
        # Get filter parameters
        role = request.args.get('role')
        is_active = request.args.get('is_active', type=bool)
        search = request.args.get('search')
        
        conn = database.get_db_connection()
        cur = conn.cursor()
        
        # Build query with filters
        where_clauses = []
        params = []
        
        if role:
            where_clauses.append('role = %s')
            params.append(role)
        
        if is_active is not None:
            where_clauses.append('is_active = %s')
            params.append(is_active)
        
        if search:
            where_clauses.append('(username ILIKE %s OR email ILIKE %s)')
            params.extend([f'%{search}%', f'%{search}%'])
        
        where_sql = ' AND '.join(where_clauses) if where_clauses else '1=1'
        
        # Count total items
        count_query = f'SELECT COUNT(*) FROM users WHERE {where_sql}'
        cur.execute(count_query, params)
        total_items = cur.fetchone()[0]
        
        # Get paginated results
        offset = (page - 1) * per_page
        query = f'''
            SELECT id, username, email, role, created_at, last_login, is_active 
            FROM users 
            WHERE {where_sql}
            ORDER BY created_at DESC
            LIMIT %s OFFSET %s
        '''
        
        cur.execute(query, params + [per_page, offset])
        
        users = []
        for user in cur.fetchall():
            users.append({
                'id': user[0],
                'username': user[1],
                'email': user[2],
                'role': user[3],
                'created_at': user[4].isoformat() if user[4] else None,
                'last_login': user[5].isoformat() if user[5] else None,
                'is_active': user[6]
            })
        
        cur.close()
        database.return_db_connection(conn)
        
        logger.info(f"Found {len(users)} users (page {page} of {(total_items + per_page - 1) // per_page})")
        
        return APIResponse.paginated(
            items=users,
            page=page,
            per_page=per_page,
            total_items=total_items,
            endpoint='users.get_users',
            message=f'Retrieved {len(users)} users'
        )
    
    except Exception as e:
        logger.exception(f"Error in get_users: {str(e)}")
        return APIResponse.error(
            message=str(e),
            code=ErrorCodes.INTERNAL_SERVER_ERROR
        ), 500

@user_bp.route('/users', methods=['POST'])
@swag_from({
    'tags': ['Users'],
    'summary': 'Create a new user',
    'description': 'Register a new user account',
    'parameters': [
        {
            'name': 'body',
            'in': 'body',
            'required': True,
            'schema': {
                'type': 'object',
                'required': ['username', 'email', 'role'],
                'properties': {
                    'username': {
                        'type': 'string',
                        'minLength': 3,
                        'maxLength': 50,
                        'example': 'johndoe'
                    },
                    'email': {
                        'type': 'string',
                        'format': 'email',
                        'example': 'john@example.com'
                    },
                    'role': {
                        'type': 'string',
                        'enum': ['admin', 'user', 'moderator'],
                        'example': 'user'
                    }
                }
            }
        }
    ],
    'responses': {
        201: {
            'description': 'User created successfully',
            'schema': {'$ref': '#/definitions/User'}
        },
        400: {'description': 'Validation error', 'schema': {'$ref': '#/definitions/Error'}},
        409: {'description': 'User already exists', 'schema': {'$ref': '#/definitions/Error'}},
        500: {'description': 'Internal server error', 'schema': {'$ref': '#/definitions/Error'}}
    },
    'security': [{'Bearer': []}]
})
@validate_request_json(UserCreate)
def create_user():
    try:
        data = request.validated_data  # Already validated by decorator
        logger.info(f"Creating user with username: {data.username}")
        
        conn = database.get_db_connection()
        cur = conn.cursor()
        
        # Check if user already exists
        cur.execute('SELECT id FROM users WHERE username = %s OR email = %s', (data.username, data.email))
        if cur.fetchone():
            cur.close()
            database.return_db_connection(conn)
            return APIResponse.error(
                message='Username or email already exists',
                code=ErrorCodes.DUPLICATE_RESOURCE
            ), 409
        
        # Insert new user
        cur.execute(
            'INSERT INTO users (username, email, role) VALUES (%s, %s, %s) RETURNING id, created_at',
            (data.username, data.email, data.role)
        )
        
        user_id, created_at = cur.fetchone()
        conn.commit()
        
        cur.close()
        database.return_db_connection(conn)
        
        logger.info(f"User created successfully with ID: {user_id}")
        
        return APIResponse.created(
            data={
                'id': user_id,
                'username': data.username,
                'email': data.email,
                'role': data.role,
                'created_at': created_at.isoformat(),
                'is_active': True
            },
            message='User created successfully'
        )
        
    except Exception as e:
        logger.exception(f"Error creating user: {str(e)}")
        return APIResponse.error(
            message=str(e),
            code=ErrorCodes.INTERNAL_SERVER_ERROR
        ), 500

@user_bp.route('/users/<int:user_id>', methods=['PUT'])
@swag_from({
    'tags': ['Users'],
    'summary': 'Update user',
    'description': 'Update user information (partial update supported)',
    'parameters': [
        {
            'name': 'user_id',
            'in': 'path',
            'type': 'integer',
            'required': True,
            'description': 'User ID to update'
        },
        {
            'name': 'body',
            'in': 'body',
            'required': True,
            'schema': {
                'type': 'object',
                'properties': {
                    'username': {'type': 'string', 'minLength': 3, 'maxLength': 50},
                    'email': {'type': 'string', 'format': 'email'},
                    'role': {'type': 'string', 'enum': ['admin', 'user', 'moderator']},
                    'is_active': {'type': 'boolean'}
                }
            }
        }
    ],
    'responses': {
        200: {'description': 'User updated successfully', 'schema': {'$ref': '#/definitions/User'}},
        400: {'description': 'Validation error', 'schema': {'$ref': '#/definitions/Error'}},
        404: {'description': 'User not found', 'schema': {'$ref': '#/definitions/Error'}},
        500: {'description': 'Internal server error', 'schema': {'$ref': '#/definitions/Error'}}
    },
    'security': [{'Bearer': []}]
})
@validate_request_json(UserUpdate)
def update_user(user_id):
    try:
        data = request.validated_data
        logger.info(f"Updating user {user_id}")
        
        conn = database.get_db_connection()
        cur = conn.cursor()
        
        # Check if user exists
        cur.execute('SELECT id FROM users WHERE id = %s', (user_id,))
        if not cur.fetchone():
            cur.close()
            database.return_db_connection(conn)
            return APIResponse.error(
                message='User not found',
                code=ErrorCodes.NOT_FOUND
            ), 404
        
        # Build update query dynamically based on provided fields
        update_fields = []
        values = []
        
        if data.username is not None:
            update_fields.append('username = %s')
            values.append(data.username)
        if data.email is not None:
            update_fields.append('email = %s')
            values.append(data.email)
        if data.role is not None:
            update_fields.append('role = %s')
            values.append(data.role)
        if data.is_active is not None:
            update_fields.append('is_active = %s')
            values.append(data.is_active)
        
        if not update_fields:
            cur.close()
            database.return_db_connection(conn)
            return APIResponse.error(
                message='No fields to update',
                code=ErrorCodes.VALIDATION_ERROR
            ), 400
        
        values.append(user_id)
        query = f'UPDATE users SET {", ".join(update_fields)} WHERE id = %s'
        
        cur.execute(query, values)
        conn.commit()
        
        # Get updated user
        cur.execute('''
            SELECT id, username, email, role, created_at, last_login, is_active 
            FROM users WHERE id = %s
        ''', (user_id,))
        updated_user = cur.fetchone()
        
        cur.close()
        database.return_db_connection(conn)
        
        return APIResponse.success(
            data={
                'id': updated_user[0],
                'username': updated_user[1],
                'email': updated_user[2],
                'role': updated_user[3],
                'created_at': updated_user[4].isoformat(),
                'last_login': updated_user[5].isoformat() if updated_user[5] else None,
                'is_active': updated_user[6]
            },
            message='User updated successfully'
        )
        
    except Exception as e:
        logger.exception(f"Error updating user: {str(e)}")
        return APIResponse.error(
            message=str(e),
            code=ErrorCodes.INTERNAL_SERVER_ERROR
        ), 500

@user_bp.route('/users/<int:user_id>', methods=['DELETE'])
@swag_from({
    'tags': ['Users'],
    'summary': 'Delete user',
    'description': 'Permanently delete a user account',
    'parameters': [
        {
            'name': 'user_id',
            'in': 'path',
            'type': 'integer',
            'required': True,
            'description': 'User ID to delete'
        }
    ],
    'responses': {
        204: {'description': 'User deleted successfully'},
        404: {'description': 'User not found', 'schema': {'$ref': '#/definitions/Error'}},
        500: {'description': 'Internal server error', 'schema': {'$ref': '#/definitions/Error'}}
    },
    'security': [{'Bearer': []}]
})
def delete_user(user_id):
    try:
        logger.info(f"Deleting user {user_id}")
        
        conn = database.get_db_connection()
        cur = conn.cursor()
        
        # Check if user exists
        cur.execute('SELECT id FROM users WHERE id = %s', (user_id,))
        if not cur.fetchone():
            cur.close()
            database.return_db_connection(conn)
            return APIResponse.error(
                message='User not found',
                code=ErrorCodes.NOT_FOUND
            ), 404
        
        cur.execute('DELETE FROM users WHERE id = %s', (user_id,))
        conn.commit()
        
        cur.close()
        database.return_db_connection(conn)
        
        logger.info(f"User {user_id} deleted successfully")
        return APIResponse.no_content()
    
    except Exception as e:
        logger.exception(f"Error deleting user: {str(e)}")
        return APIResponse.error(
            message=str(e),
            code=ErrorCodes.INTERNAL_SERVER_ERROR
        ), 500