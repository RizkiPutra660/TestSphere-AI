import os
from flask import Blueprint, request, jsonify, current_app, make_response, redirect
from functools import wraps
import data.database as database
import bcrypt
import jwt
import requests
from datetime import datetime, timedelta
from itsdangerous import URLSafeTimedSerializer, SignatureExpired, BadSignature
from flask_mail import Message
from flask_jwt_extended import JWTManager
from flask_jwt_extended import create_access_token, jwt_required, get_jwt_identity
from pydantic import ValidationError
from utils.validation import RegisterRequest, LoginRequest, PasswordResetRequest, PasswordResetConfirm
from utils.api_response import error_response, validation_error_response, success_response
from utils.logger import setup_logger

auth_bp = Blueprint('auth', __name__, url_prefix='/api')
logger = setup_logger(__name__)

# Cookie flags must be environment-driven (local vs AWS)
COOKIE_SECURE = os.getenv("COOKIE_SECURE", "false").lower() == "true"
COOKIE_SAMESITE = os.getenv("COOKIE_SAMESITE", "Lax")

def set_auth_cookie(response, token, max_age: int):
    response.set_cookie(
        "access_token",
        token,
        httponly=True,
        secure=COOKIE_SECURE,
        samesite=COOKIE_SAMESITE,
        path="/",
        max_age=max_age,
    )
    return response

def get_serializer():
    """
    Returns a URL-safe serializer using the app's SECRET_KEY.
    Used to sign and verify password reset tokens.
    """
    return URLSafeTimedSerializer(current_app.config['SECRET_KEY'])

def send_password_reset_email(email: str):
    """
    Generate a signed reset token and send an email
    with a link to the React reset-password page.
    """
    s = get_serializer()
    token = s.dumps(email, salt="password-reset-salt")

    frontend_url = current_app.config.get('FRONTEND_URL', 'http://localhost:5173')
    reset_link = f"{frontend_url}/reset-password?token={token}"

    msg = Message(
        subject="Reset your TestSphere AI password",
        recipients=[email],
    )
    msg.body = (
        "Hi,\n\n"
        "We received a request to reset your password for TestSphere AI.\n\n"
        f"Click the link below to reset it:\n{reset_link}\n\n"
        "If you did not request this, you can ignore this email.\n"
    )

    # Get the Mail extension instance from the app
    mail = current_app.extensions.get('mail')
    if mail:
        mail.send(msg)
        logger.info(f"Sent password reset email to {email}")
    else:
        logger.error("Mail extension not found, email not sent")

def token_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        token = None
        
        # First, check for token in HTTP-only cookie
        if 'access_token' in request.cookies:
            token = request.cookies.get('access_token')
        # Fallback: Check for token in Authorization header
        elif 'Authorization' in request.headers:
            auth_header = request.headers['Authorization']
            if auth_header.startswith('Bearer '):
                token = auth_header.split(' ')[1]
        
        if not token:
            return jsonify({'error': 'Token is missing'}), 401
        
        try:
            # Decode token
            data = jwt.decode(
                token, 
                current_app.config['JWT_SECRET_KEY'], 
                algorithms=['HS256']
            )
            # Add user info to request
            request.current_user = data
        except jwt.ExpiredSignatureError:
            return jsonify({'error': 'Token has expired'}), 401
        except jwt.InvalidTokenError:
            return jsonify({'error': 'Invalid token'}), 401
        
        return f(*args, **kwargs)
    return decorated

@auth_bp.route('/register', methods=['POST'])
def register():
    """User registration endpoint with validation and rate limiting."""
    from app import limiter
    
    # Apply rate limiting: 5 registrations per hour
    limiter.limit("5 per hour")(lambda: None)()
    
    try:
        # Validate request data
        try:
            data = RegisterRequest(**request.get_json())
        except ValidationError as e:
            return validation_error_response(e.errors())
        
        username = data.username
        email = data.email
        password = data.password

        conn = database.get_db_connection()
        cur = conn.cursor()

        # Check existing user
        cur.execute('SELECT id FROM users WHERE email = %s', (email,))
        if cur.fetchone():
            cur.close()

            database.return_db_connection(conn)
            return error_response('Email already registered', 409)

        # Create User (Transaction Start)
        try:
            # Insert into users table
            cur.execute("""
                INSERT INTO users (username, email, role, is_active, created_at)
                VALUES (%s, %s, 'user', TRUE, NOW())
                RETURNING id
            """, (username, email))
            
            user_id = cur.fetchone()[0]

            # Hash Password
            salt = bcrypt.gensalt()
            password_hash = bcrypt.hashpw(password.encode('utf-8'), salt).decode('utf-8')

            # Insert into user_credentials table
            cur.execute("""
                INSERT INTO user_credentials (user_id, password_hash, password_updated_at, created_at)
                VALUES (%s, %s, NOW(), NOW())
            """, (user_id, password_hash))

            conn.commit()

            # Auto-Login (Generate Token)
            token = create_access_token(identity=str(user_id))

            logger.info(f"New user registered: {username} ({email})")
            
            # Create response with HTTP-only cookie
            response = make_response(jsonify({
                'message': 'Registration successful',
                'user': {
                    'id': user_id,
                    'username': username,
                    'email': email,
                    'role': 'user'
                }
            }), 201)
            
            # Set HTTP-only cookie
            set_auth_cookie(response, token, max_age=24 * 60 * 60)
            
            return response

        except Exception as db_err:
            conn.rollback()
            logger.error(f"DB Transaction Error: {str(db_err)}")
            raise db_err
        finally:
            cur.close()

            database.return_db_connection(conn)

    except Exception as e:
        logger.exception(f"Registration Error: {str(e)}")
        return error_response('Registration failed. Please try again.', 500)

# Login endpoint
@auth_bp.route('/login', methods=['POST'])
def login():
    """User login endpoint with validation and rate limiting."""
    from app import limiter
    
    # Apply rate limiting: 10 login attempts per hour
    limiter.limit("10 per hour")(lambda: None)()
    
    try:
        # Validate request data
        try:
            json_data = request.get_json()
            logger.info(f"Login request data: {json_data}")
            data = LoginRequest(**json_data)
        except ValidationError as e:
            logger.error(f"Login validation error: {e.errors()}")
            return validation_error_response(e.errors())
        
        email = data.email
        password = data.password
        remember_for_30_days = data.rememberMe

        conn = database.get_db_connection()
        cur = conn.cursor()

        # Find user by email and get password hash
        cur.execute('''
            SELECT u.id, u.username, u.email, u.role, u.is_active, uc.password_hash
            FROM users u
            JOIN user_credentials uc ON u.id = uc.user_id
            WHERE u.email = %s
        ''', (email,))

        user = cur.fetchone()

        if not user:
            cur.close()

            database.return_db_connection(conn)
            return error_response('Invalid email or password', 401)

        user_id, username, user_email, role, is_active, stored_password = user

        # Verify password with bcrypt
        if not bcrypt.checkpw(password.encode('utf-8'), stored_password.encode('utf-8')):
            cur.close()

            database.return_db_connection(conn)
            return error_response('Invalid email or password', 401)

        if not is_active:
            cur.close()

            database.return_db_connection(conn)
            return error_response('Account is deactivated', 401)

        # Update last login
        cur.execute('UPDATE users SET last_login = NOW() WHERE id = %s', (user_id,))
        conn.commit()

        cur.close()


        database.return_db_connection(conn)

        # 30 days if checked, else 1 day
        days = 30 if remember_for_30_days else 1
        max_age = days * 24 * 60 * 60  # seconds

        # Make JWT expiry match cookie expiry
        token = create_access_token(
            identity=str(user_id),
            expires_delta=timedelta(days=days)
        )

        logger.info(f"User {username} (id={user_id}) logged in successfully (rememberMe={remember_for_30_days})")

        # Create response with HTTP-only cookie
        response = make_response(jsonify({
            'message': 'Login successful',
            'user': {
                'id': user_id,
                'username': username,
                'email': user_email,
                'role': role
            },
            # Also return token in body for CLI/API clients
            'access_token': token
        }))

        set_auth_cookie(response, token, max_age=max_age)

        return response

    except Exception as e:
        logger.exception(f"Error in login: {str(e)}")
        return error_response('Login failed', 500)

# Logout endpoint - clears the HTTP-only cookie
@auth_bp.route('/logout', methods=['POST'])
def logout():
    response = make_response(jsonify({'message': 'Logged out successfully'}))
    response.set_cookie(
        "access_token",
        "",
        httponly=True,
        secure=COOKIE_SECURE,
        samesite=COOKIE_SAMESITE,
        path="/",
        max_age=0,
        expires=0,
    )
    return response

# Verify token endpoint
@auth_bp.route('/verify-token', methods=['GET'])
@jwt_required()
def verify_token():
    """Verify if the current token is valid and return user info"""
    user_id = int(get_jwt_identity())  # Convert string back to int
    
    # Fetch user details from database since JWT only stores user_id
    conn = database.get_db_connection()
    cur = conn.cursor()
    
    cur.execute('''
        SELECT id, username, email, role
        FROM users
        WHERE id = %s
    ''', (user_id,))
    
    user = cur.fetchone()
    cur.close()

    database.return_db_connection(conn)
    
    if not user:
        return jsonify({'error': 'User not found'}), 404
    
    return jsonify({
        'valid': True,
        'user': {
            'id': user[0],
            'username': user[1],
            'email': user[2],
            'role': user[3]
        }
    })

@auth_bp.route('/google-login', methods=['POST'])
def google_login():
    try:
        data = request.get_json()
        access_token = data.get('access_token')

        if not access_token:
            return jsonify({'error': 'Access token required'}), 400

        google_user = requests.get(
            'https://www.googleapis.com/oauth2/v3/userinfo',
            headers={'Authorization': f'Bearer {access_token}'}
        ).json()

        email = google_user.get('email')
        username = google_user.get('name') or email.split('@')[0]

        if not email:
            return jsonify({'error': 'Google email not found'}), 400

        conn = database.get_db_connection()
        cur = conn.cursor()

        cur.execute("""
            SELECT id, username, email, role, is_active
            FROM users
            WHERE email=%s
        """, (email,))
        user = cur.fetchone()

        if not user:
            cur.execute("""
                INSERT INTO users (username, email, role, is_active, created_at)
                VALUES (%s, %s, %s, %s, NOW())
                RETURNING id, username, email, role, is_active
            """, (username, email, 'user', True))
            user = cur.fetchone()
            conn.commit()

        user_id, username, user_email, role, is_active = user

        if not is_active:
            return jsonify({'error': 'Account disabled'}), 403

        cur.execute("UPDATE users SET last_login = NOW() WHERE id=%s", (user_id,))
        conn.commit()
        cur.close()

        database.return_db_connection(conn)

        token = create_access_token(identity=str(user_id))

        # Create response with HTTP-only cookie
        response = make_response(jsonify({
            'message': 'Google login success',
            'user': {
                'id': user_id,
                'username': username,
                'email': user_email,
                'role': role
            }
        }))
        
        # Set HTTP-only cookie
        set_auth_cookie(response, token, max_age=24 * 60 * 60)
        
        return response

    except Exception as e:
        return jsonify({'error': str(e)}), 500
    
@auth_bp.route('/forgot-password', methods=['POST'])
def forgot_password():
    """
    Accepts { email } and, if the user exists,
    sends a password reset email with a signed token.
    Response is generic to avoid leaking which emails exist.
    """
    from app import limiter
    
    # Rate limit: 3 forgot password requests per hour
    limiter.limit("3 per hour")(lambda: None)()
    
    try:
        # Validate request data
        try:
            data = PasswordResetRequest(**request.get_json())
        except ValidationError as e:
            return validation_error_response(e.errors())
        
        email = data.email

        conn = database.get_db_connection()
        cur = conn.cursor()

        # Only reset if user has credentials
        cur.execute("""
            SELECT u.id, u.email
            FROM users u
            JOIN user_credentials uc ON u.id = uc.user_id
            WHERE u.email = %s
        """, (email,))
        user = cur.fetchone()

        cur.close()


        database.return_db_connection(conn)

        if user:
            try:
                send_password_reset_email(email)
            except Exception as e:
                logger.error(f"Error sending reset email: {e}")

        # Always return the same message
        return success_response(message='If an account exists, a reset link has been sent.')

    except Exception as e:
        logger.exception(f"Error in forgot_password: {e}")
        return error_response('Something went wrong', 500)


# =======================
# RESET PASSWORD
# =======================

@auth_bp.route('/reset-password', methods=['POST'])
def reset_password():
    """
    Accepts { token, password }, verifies token, and updates the user's password.
    """
    from app import limiter
    
    # Rate limit: 5 reset attempts per hour
    limiter.limit("5 per hour")(lambda: None)()
    
    try:
        # Validate request data
        try:
            data = PasswordResetConfirm(**request.get_json())
        except ValidationError as e:
            return validation_error_response(e.errors())
        
        token = data.token
        new_password = data.password

        s = get_serializer()

        try:
            # max_age = 3600 seconds = 1 hour validity
            email = s.loads(
                token,
                salt="password-reset-salt",
                max_age=3600
            )
        except SignatureExpired:
            return error_response('Reset link has expired. Please request a new one.', 400)
        except BadSignature:
            return error_response('Invalid or tampered reset token.', 400)

        conn = database.get_db_connection()
        cur = conn.cursor()

        # Make sure user exists and has credentials
        cur.execute("""
            SELECT u.id
            FROM users u
            JOIN user_credentials uc ON u.id = uc.user_id
            WHERE u.email = %s
        """, (email,))
        row = cur.fetchone()

        if not row:
            cur.close()

            database.return_db_connection(conn)
            return error_response('User not found.', 404)

        user_id = row[0]

        # Hash new password with bcrypt
        hashed = bcrypt.hashpw(new_password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

        cur.execute("""
            UPDATE user_credentials
            SET password_hash = %s
            WHERE user_id = %s
        """, (hashed, user_id))

        conn.commit()
        cur.close()

        database.return_db_connection(conn)

        logger.info(f"Password reset for user_id={user_id}")
        return success_response(message='Password has been reset successfully.')

    except Exception as e:
        logger.exception(f"Error in reset_password: {e}")
        return error_response('Something went wrong', 500)
    
# =======================
# GITHUB LOGIN
# =======================

@auth_bp.route('/github-login', methods=['GET'])
def github_login():
    """Returns the GitHub OAuth authorization URL"""
    github_client_id = os.getenv('GITHUB_CLIENT_ID')
    redirect_uri = 'http://localhost:5000/api/github-callback'
    scope = 'user:email'
    
    github_auth_url = f"https://github.com/login/oauth/authorize?client_id={github_client_id}&redirect_uri={redirect_uri}&scope={scope}"
    
    return jsonify({"auth_url": github_auth_url})


@auth_bp.route('/github-callback', methods=['GET'])
def github_callback():
    """Handle the callback from GitHub OAuth"""
    code = request.args.get('code')
    
    if not code:
        return redirect('http://localhost:5173/login?error=github_failed')
    
    try:
        # Exchange code for access token
        token_response = requests.post(
            'https://github.com/login/oauth/access_token',
            data={
                'client_id': os.getenv('GITHUB_CLIENT_ID'),
                'client_secret': os.getenv('GITHUB_CLIENT_SECRET'),
                'code': code
            },
            headers={'Accept': 'application/json'}
        )
        
        token_data = token_response.json()
        access_token = token_data.get('access_token')
        
        if not access_token:
            logger.error(f"GitHub token error: {token_data}")
            return redirect('http://localhost:5173/login?error=github_failed')
        
        # Get user info from GitHub
        user_response = requests.get(
            'https://api.github.com/user',
            headers={
                'Authorization': f'Bearer {access_token}',
                'Accept': 'application/json'
            }
        )
        github_user = user_response.json()
        
        # Get user email (might be private, so fetch from emails endpoint)
        email_response = requests.get(
            'https://api.github.com/user/emails',
            headers={
                'Authorization': f'Bearer {access_token}',
                'Accept': 'application/json'
            }
        )
        emails = email_response.json()
        primary_email = next((e['email'] for e in emails if e.get('primary')), None)
        
        email = primary_email or github_user.get('email') or f"{github_user['login']}@github.local"
        username = github_user.get('name') or github_user.get('login') or 'GitHub User'
        
        # Check if user exists, if not create
        conn = database.get_db_connection()
        cur = conn.cursor()
        
        cur.execute("""
            SELECT id, username, email, role, is_active
            FROM users
            WHERE email = %s
        """, (email,))
        user = cur.fetchone()
        
        if not user:
            # Create new user
            cur.execute("""
                INSERT INTO users (username, email, role, is_active, created_at)
                VALUES (%s, %s, 'user', TRUE, NOW())
                RETURNING id, username, email, role, is_active
            """, (username, email))
            user = cur.fetchone()
            conn.commit()
            logger.info(f"New GitHub user created: {username} ({email})")
        
        user_id, username, user_email, role, is_active = user
        
        if not is_active:
            cur.close()

            database.return_db_connection(conn)
            return redirect('http://localhost:5173/login?error=account_disabled')
        
        # Update last login
        cur.execute("UPDATE users SET last_login = NOW() WHERE id = %s", (user_id,))
        conn.commit()
        cur.close()

        database.return_db_connection(conn)
        
        # Create JWT token
        token = create_access_token(identity=str(user_id))
        
        logger.info(f"GitHub login successful: {username}")
        
        # Redirect to dashboard with cookie set
        response = make_response(redirect('http://localhost:5173/dashboard'))
        set_auth_cookie(response, token, max_age=24 * 60 * 60)
        
        return response
        
    except Exception as e:
        logger.exception(f"GitHub OAuth error: {str(e)}")
        return redirect('http://localhost:5173/login?error=github_failed')