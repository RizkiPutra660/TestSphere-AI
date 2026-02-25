"""
API endpoints for secrets management.
All secrets are write-only - values never returned after creation.
"""
from flask import Blueprint, request, jsonify
from routes.auth_routes import token_required
from utils.local_secrets_provider import secrets_provider
import re
import logging
logger = logging.getLogger(__name__)
secrets_bp = Blueprint('secrets', __name__,url_prefix='/api')
# Validation regex for key names
KEY_NAME_PATTERN = re.compile(r'^[A-Z_][A-Z0-9_]*$')
@secrets_bp.route('/projects/<int:project_id>/secrets', methods=['GET'])
@token_required
def list_project_secrets(project_id):
    """
    List all secrets for a project (metadata only).
    Values are NEVER returned.
    """
    try:
        secrets = secrets_provider.list_secrets(project_id)
        return jsonify({'secrets': secrets}), 200
    except Exception as e:
        logger.error(f"Error listing secrets: {e}")
        return jsonify({'error': 'Failed to list secrets'}), 500
@secrets_bp.route('/projects/<int:project_id>/secrets', methods=['POST'])
@token_required
def create_secret(project_id):
    """
    Create a new secret.
    Value is accepted once and never returned.
    """
    data = request.json
    
    key_name = data.get('key_name', '').strip().upper()
    value = data.get('value', '').strip()
    description = data.get('description', '').strip()
    
    # Validation
    if not key_name or not value:
        return jsonify({'error': 'key_name and value are required'}), 400
    
    if not KEY_NAME_PATTERN.match(key_name):
        return jsonify({
            'error': 'key_name must match pattern: ^[A-Z_][A-Z0-9_]*$ (e.g., DATABASE_URL)'
        }), 400
    
    try:
        secret_id = secrets_provider.create_secret(
            project_id=project_id,
            key_name=key_name,
            value=value,
            description=description
        )
        
        return jsonify({
            'message': 'Secret created successfully',
            'secret_id': secret_id,
            'key_name': key_name
        }), 201
        
    except Exception as e:
        error_msg = str(e)
        
        # Check for duplicate key
        if 'unique_project_secret' in error_msg or 'duplicate key' in error_msg:
            return jsonify({'error': f'Secret {key_name} already exists for this project'}), 409
        
        logger.error(f"Error creating secret: {e}")
        return jsonify({'error': 'Failed to create secret'}), 500
@secrets_bp.route('/projects/<int:project_id>/secrets/<string:key_name>', methods=['DELETE'])
@token_required
def delete_secret(project_id, key_name):
    """Delete a secret."""
    try:
        deleted = secrets_provider.delete_secret(project_id, key_name)
        
        if deleted:
            return jsonify({'message': f'Secret {key_name} deleted successfully'}), 200
        else:
            return jsonify({'error': 'Secret not found'}), 404
            
    except Exception as e:
        logger.error(f"Error deleting secret: {e}")
        return jsonify({'error': 'Failed to delete secret'}), 500