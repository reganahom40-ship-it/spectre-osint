"""
Authentication, session, and role-based access control (RBAC) helpers for SPECTRE.
"""
from functools import wraps
from flask import session, jsonify, request, g
from typing import Optional, Dict, Any
from modules.db import get_user_by_id, get_user_by_email

def get_current_user() -> Optional[Dict[str, Any]]:
    """Retrieves the currently authenticated user from Flask session."""
    user_id = session.get('user_id')
    if not user_id:
        return None
    user = get_user_by_id(user_id)
    return user

def login_user(user: Dict[str, Any]):
    """Establishes authenticated session for a user."""
    session['user_id'] = user['id']
    session['email'] = user['email']
    session['tier'] = user['tier']
    session.permanent = True

def logout_user():
    """Clears authenticated session."""
    session.clear()

def is_admin(user: Optional[Dict[str, Any]]) -> bool:
    """Checks if user has master administrative privileges."""
    if not user:
        return False
    return user.get('tier') == 'admin'

def has_tier(user: Optional[Dict[str, Any]], required_tier: str) -> bool:
    """Evaluates tier hierarchy: free < premium <= lifetime <= admin."""
    if not user:
        return False
    user_tier = user.get('tier', 'free').lower()
    if user_tier == 'admin':
        return True
    if required_tier == 'lifetime':
        return user_tier in ('lifetime', 'admin')
    if required_tier == 'premium':
        return user_tier in ('premium', 'lifetime', 'admin')
    return True

def login_required(f):
    """Decorator requiring an active user session."""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        user = get_current_user()
        if not user:
            return jsonify({
                'success': False,
                'error': 'Authentication required. Please sign in or register.',
                'auth_required': True
            }), 401
        g.user = user
        return f(*args, **kwargs)
    return decorated_function

def admin_required(f):
    """Decorator requiring master administrative privileges."""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        user = get_current_user()
        # Also support secret admin header for external automation
        admin_secret = request.headers.get('X-Admin-Key', '')
        configured_key = "spectre_master_admin_key"
        if admin_secret and admin_secret == configured_key:
            return f(*args, **kwargs)

        if not user or not is_admin(user):
            return jsonify({
                'success': False,
                'error': 'Administrative authorization required.',
                'admin_required': True
            }), 403
        g.user = user
        return f(*args, **kwargs)
    return decorated_function
