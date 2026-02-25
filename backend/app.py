from dotenv import load_dotenv
import os
from pathlib import Path

# Load environment variables from .env file BEFORE any other imports
# Only load if NOT production (AWS uses native env vars)
ENV = os.getenv("ENV", "local")
if ENV != "production":
    # Check current directory first, then parent directory
    env_path = Path('.') / '.env'
    if not env_path.exists():
        env_path = Path('..') / '.env'
    load_dotenv(dotenv_path=env_path)

from flask import Flask, jsonify
from flask_cors import CORS
from flask_mail import Mail
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from flask_compress import Compress
from routes.system_routes import db_bp
from routes.ai_routes import ai_bp
from routes.auth_routes import auth_bp
from routes.users_routes import user_bp
from routes.tests_routes import tests_bp
from routes.projects_routes import projects_bp
from routes.execution_routes import ui_bp, integration_bp
import data.database as database
from flask_jwt_extended import JWTManager
from datetime import timedelta
from routes.secrets_routes import secrets_bp
from routes.queue_routes import queue_bp
from utils.logger import setup_logger

# Setup application logger
logger = setup_logger(__name__)



app = Flask(__name__)

# Initialize response compression for better performance
compress = Compress()
compress.init_app(app)

# Rate limiting configuration
# Disable rate limiting in development mode, strict limits in production
if ENV == "production":
    limiter = Limiter(
        app=app,
        key_func=get_remote_address,
        default_limits=["200 per day", "50 per hour"],
        storage_uri="memory://",
        strategy="fixed-window"
    )
else:
    # Development: disable default limits, very lenient
    limiter = Limiter(
        app=app,
        key_func=get_remote_address,
        default_limits=["100000 per day", "50000 per hour"],
        storage_uri="memory://",
        strategy="fixed-window"
    )

# CORS with credentials support for HTTP-only cookies
allowed_origins_raw = os.environ.get("ALLOWED_ORIGINS", "http://localhost:5173")
origins = [o.strip() for o in allowed_origins_raw.split(",") if o.strip()]

CORS(app, 
     origins=origins,
     supports_credentials=True)

# JWT Configuration
app.config['JWT_SECRET_KEY'] = os.environ.get('JWT_SECRET_KEY', 'your-super-secret-key-change-in-production')
app.config['JWT_ACCESS_TOKEN_EXPIRES'] = timedelta(hours=24)
app.config['JWT_TOKEN_LOCATION'] = ['cookies', 'headers']  # Support both cookies and headers
app.config['JWT_ACCESS_COOKIE_NAME'] = 'access_token'      # Cookie name
app.config['JWT_COOKIE_CSRF_PROTECT'] = False              # Rely on SameSite cookie attribute instead
app.config['JWT_COOKIE_SAMESITE'] = 'Strict'               # Strict SameSite provides CSRF protection
jwt = JWTManager(app)

# JWT Error Handlers (silent - only return JSON responses)
@jwt.invalid_token_loader
def invalid_token_callback(error_string):
    return jsonify({'error': 'Invalid token', 'details': error_string}), 422

@jwt.unauthorized_loader
def unauthorized_callback(error_string):
    return jsonify({'error': 'Missing authorization header', 'details': error_string}), 401

@jwt.expired_token_loader
def expired_token_callback(jwt_header, jwt_payload):
    return jsonify({'error': 'Token has expired'}), 401

app.config['SECRET_KEY'] = os.environ.get(
    'SECRET_KEY',
    'another-very-secret-key-change-in-production'
)

app.config['FRONTEND_URL'] = os.environ.get(
    'FRONTEND_URL',
    'http://localhost:5173'
)

app.config['MAIL_SERVER'] = 'sandbox.smtp.mailtrap.io'
app.config['MAIL_PORT'] = 587
app.config['MAIL_USE_TLS'] = True
app.config['MAIL_USERNAME'] = '8abc9e090955cd'
app.config['MAIL_PASSWORD'] = '06ae0cdc15a734'
app.config['MAIL_DEFAULT_SENDER'] = 'no-reply@testsphere.ai'

mail = Mail(app)

# Initialize database connection pool
import data.database as db
db.initialize_connection_pool(minconn=2, maxconn=10)

# Initialize caching layer
from utils.cache import initialize_cache
cache = initialize_cache(app)

# Initialize Swagger/OpenAPI documentation
from utils.swagger_config import init_swagger
swagger = init_swagger(app)

# Request timing middleware
from utils.metrics import get_metrics_collector
import time

@app.before_request
def before_request():
    """Track request start time"""
    from flask import g
    g.start_time = time.time()

@app.after_request
def after_request(response):
    """Track request completion and metrics"""
    from flask import g, request
    
    if hasattr(g, 'start_time'):
        duration = time.time() - g.start_time
        metrics = get_metrics_collector()
        
        # Record metrics for this endpoint
        endpoint = request.endpoint or 'unknown'
        success = response.status_code < 400
        metrics.record_request(endpoint, duration, success)
        
        # Add timing header
        response.headers['X-Response-Time'] = f"{duration*1000:.2f}ms"
    
    return response

# Register the Blueprints
app.register_blueprint(db_bp)
app.register_blueprint(ai_bp)
app.register_blueprint(auth_bp)
app.register_blueprint(user_bp)
app.register_blueprint(tests_bp)
app.register_blueprint(projects_bp)
app.register_blueprint(secrets_bp)
app.register_blueprint(integration_bp)
app.register_blueprint(queue_bp)
app.register_blueprint(ui_bp)


@app.route('/')
def index():
    return "Welcome to the User Management API"

# Graceful shutdown handling
import signal
import sys

def graceful_shutdown(signum, frame):
    """Handle graceful shutdown on SIGTERM/SIGINT"""
    logger.info(f"Received signal {signum}, initiating graceful shutdown...")
    
    # Close database connection pool
    try:
        db.close_all_connections()
        logger.info("Database connections closed")
    except Exception as e:
        logger.error(f"Error closing database connections: {e}")
    
    # Log final metrics
    try:
        metrics = get_metrics_collector()
        stats = metrics.get_global_stats()
        logger.info(f"Final metrics - Total requests: {stats['total_requests']}, "
                   f"Total errors: {stats['total_errors']}, "
                   f"Uptime: {stats['uptime_seconds']:.0f}s")
    except Exception as e:
        logger.error(f"Error logging final metrics: {e}")
    
    logger.info("Shutdown complete")
    sys.exit(0)

if __name__ == '__main__':
    # Register signal handlers (main thread only)
    signal.signal(signal.SIGTERM, graceful_shutdown)
    signal.signal(signal.SIGINT, graceful_shutdown)
    
    # Test database connection once at startup
    database.test_connection()

    app.run(debug=(ENV != "production"), port=5000)