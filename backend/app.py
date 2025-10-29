"""
Flask Backend for AI/BI External Embedding
Handles user authentication, OAuth token minting, and dashboard embedding context.
"""

import os
import time
import json
import base64
import urllib.parse
from datetime import datetime
from flask import Flask, jsonify, request, session
from flask_cors import CORS
from functools import wraps
from dotenv import load_dotenv
import requests

# Load environment variables from .env file
load_dotenv('.env')

app = Flask(__name__)
app.secret_key = 'dev-secret-key-for-demo'  # Simple default for development
app.config['DEBUG'] = True  # Development mode

# Enable CORS for frontend communication
CORS(app, supports_credentials=True, origins=['http://localhost:3000'])

# Dummy users for demonstration (simulating row-level security)
DUMMY_USERS = {
    'alice': {
        'id': 'user_alice',
        'name': 'Alice Johnson',
        'email': 'alice@example.com',
        'department': 'Sales'
    },
    'bob': {
        'id': 'user_bob',
        'name': 'Bob Smith',
        'email': 'bob@example.com',
        'department': 'Engineering'
    }
}


def login_required(f):
    """Decorator to ensure user is authenticated"""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'user_id' not in session:
            return jsonify({'error': 'Authentication required'}), 401
        return f(*args, **kwargs)
    return decorated_function


def mint_databricks_token(user_data):
    """
    Mint an OAuth token for Databricks dashboard embedding.
    
    Follows the official Databricks 3-step token generation process:
    1. Get all-apis token from OIDC endpoint
    2. Get token info for the dashboard with external viewer context
    3. Generate scoped token with authorization details
    
    This enables row-level security by passing external_viewer_id (user identity)
    and external_value (user attributes like department) to Databricks.
    
    Args:
        user_data: Dictionary containing user information
        
    Returns:
        Dictionary with token and expiration info
        
    Raises:
        Exception: If required credentials are missing or token generation fails
    """
    
    # Databricks workspace configuration
    workspace_url = os.environ.get('DATABRICKS_WORKSPACE_URL')
    client_id = os.environ.get('DATABRICKS_CLIENT_ID')
    client_secret = os.environ.get('DATABRICKS_CLIENT_SECRET')
    dashboard_id = os.environ.get('DATABRICKS_DASHBOARD_ID')
    
    # Validate required configuration
    if not all([workspace_url, client_id, client_secret, dashboard_id]):
        raise Exception(
            "Missing required Databricks configuration. "
            "Please check your .env file has all required values: "
            "DATABRICKS_WORKSPACE_URL, DATABRICKS_CLIENT_ID, "
            "DATABRICKS_CLIENT_SECRET, DATABRICKS_DASHBOARD_ID"
        )
    
    # Create Basic Auth header
    basic_auth = base64.b64encode(
        f"{client_id}:{client_secret}".encode()
    ).decode()
    
    # Step 1: Get all-apis token
    oidc_response = requests.post(
        f"{workspace_url}/oidc/v1/token",
        headers={
            "Content-Type": "application/x-www-form-urlencoded",
            "Authorization": f"Basic {basic_auth}",
        },
        data=urllib.parse.urlencode({
            "grant_type": "client_credentials",
            "scope": "all-apis"
        })
    )
    
    if oidc_response.status_code != 200:
        raise Exception(f"Failed to get OIDC token: {oidc_response.status_code} - {oidc_response.text}")
    
    oidc_token = oidc_response.json()["access_token"]
    
    # Step 2: Get token info for the dashboard with user context
    # external_viewer_id: unique user identifier for row-level security
    # external_value: user attributes (e.g., department) for filtering
    token_info_url = (
        f"{workspace_url}/api/2.0/lakeview/dashboards/"
        f"{dashboard_id}/published/tokeninfo"
        f"?external_viewer_id={urllib.parse.quote(user_data['email'])}"
        f"&external_value={urllib.parse.quote(user_data['department'])}"
    )
    
    token_info_response = requests.get(
        token_info_url,
        headers={"Authorization": f"Bearer {oidc_token}"}
    )
    
    if token_info_response.status_code != 200:
        raise Exception(f"Failed to get token info: {token_info_response.status_code} - {token_info_response.text}")
    
    token_info = token_info_response.json()
    
    # Step 3: Generate scoped token with authorization details
    params = token_info.copy()
    authorization_details = params.pop("authorization_details", None)
    params.update({
        "grant_type": "client_credentials",
        "authorization_details": json.dumps(authorization_details)
    })
    
    scoped_response = requests.post(
        f"{workspace_url}/oidc/v1/token",
        headers={
            "Content-Type": "application/x-www-form-urlencoded",
            "Authorization": f"Basic {basic_auth}",
        },
        data=urllib.parse.urlencode(params)
    )
    
    if scoped_response.status_code != 200:
        raise Exception(f"Failed to get scoped token: {scoped_response.status_code} - {scoped_response.text}")
    
    scoped_token_data = scoped_response.json()
    
    return {
        'access_token': scoped_token_data['access_token'],
        'token_type': 'Bearer',
        'expires_in': scoped_token_data.get('expires_in', 3600),
        'created_at': int(time.time())
    }


@app.route('/api/auth/login', methods=['POST'])
def login():
    """
    Authenticate user by username only (simplified for demo).
    In production, integrate with your actual authentication system.
    """
    data = request.get_json()
    username = data.get('username')
    
    # Validate username exists
    user = DUMMY_USERS.get(username)
    if not user:
        return jsonify({'error': 'Invalid username'}), 401
    
    # Create session
    session['user_id'] = user['id']
    session['username'] = username
    
    return jsonify({
        'success': True,
        'user': {
            'id': user['id'],
            'name': user['name'],
            'email': user['email'],
            'department': user['department']
        }
    })


@app.route('/api/auth/logout', methods=['POST'])
def logout():
    """Clear user session"""
    session.clear()
    return jsonify({'success': True})


@app.route('/api/auth/current-user', methods=['GET'])
@login_required
def get_current_user():
    """Get currently authenticated user info"""
    username = session.get('username')
    user = DUMMY_USERS.get(username)
    
    return jsonify({
        'id': user['id'],
        'name': user['name'],
        'email': user['email'],
        'department': user['department']
    })


@app.route('/api/dashboard/embed-config', methods=['GET'])
@login_required
def get_embed_config():
    """
    Provide dashboard embedding configuration and token.
    
    This endpoint:
    1. Retrieves the current user from session
    2. Mints a fresh Databricks OAuth token for that user
    3. Returns dashboard configuration and token to frontend
    
    The frontend will use this information to initialize the
    Databricks embedding SDK.
    """
    username = session.get('username')
    user = DUMMY_USERS.get(username)
    
    # Mint fresh token for the current user
    token_data = mint_databricks_token(user)
    
    # Dashboard configuration
    dashboard_config = {
        'workspace_url': os.environ.get('DATABRICKS_WORKSPACE_URL'),
        'workspace_id': os.environ.get('DATABRICKS_WORKSPACE_ID'),
        'dashboard_id': os.environ.get('DATABRICKS_DASHBOARD_ID'),
        'warehouse_id': os.environ.get('DATABRICKS_WAREHOUSE_ID'),
        'embed_token': token_data['access_token'],
        'token_expires_in': token_data['expires_in'],
        'user_context': {
            'id': user['id'],
            'name': user['name'],
            'email': user['email'],
            'department': user['department']
        }
    }
    
    return jsonify(dashboard_config)


@app.route('/api/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({
        'status': 'healthy',
        'timestamp': datetime.utcnow().isoformat()
    })


if __name__ == '__main__':
    # Run Flask development server
    # In production, use a production WSGI server like Gunicorn
    app.run(
        host='0.0.0.0',
        port=5000,
        debug=True
    )


