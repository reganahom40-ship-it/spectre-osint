"""
Database engine for SPECTRE OSINT platform.
SQLite-backed persistence for users, subscription tiers, search quotas, and payments.
Zero external dependencies.
"""
import sqlite3
import os
import time
import logging
from typing import Optional, Dict, Any, List
from werkzeug.security import generate_password_hash, check_password_hash

logger = logging.getLogger(__name__)

DB_PATH = os.environ.get('DATABASE_PATH', os.path.join(os.path.dirname(os.path.dirname(__file__)), 'spectre.db'))

def get_db_connection() -> sqlite3.Connection:
    """Creates a thread-safe connection to the SQLite database with Row factory."""
    conn = sqlite3.connect(DB_PATH, timeout=10.0)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL;")
    return conn

def init_db():
    """Initializes schema for users, subscriptions, and transactions."""
    with get_db_connection() as conn:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email TEXT UNIQUE NOT NULL COLLATE NOCASE,
                password_hash TEXT NOT NULL,
                tier TEXT NOT NULL DEFAULT 'free', -- 'free', 'premium', 'lifetime', 'admin'
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                searches_count INTEGER DEFAULT 0,
                last_login TIMESTAMP,
                notes TEXT DEFAULT ''
            );

            CREATE TABLE IF NOT EXISTS payments (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER,
                amount REAL,
                currency TEXT DEFAULT 'USD',
                method TEXT, -- 'card', 'crypto', 'cashapp', 'admin_grant'
                tier_granted TEXT,
                status TEXT DEFAULT 'completed',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users (id)
            );

            CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
        """)
        conn.commit()

    # Automatically bootstrap default master admin if configured or none exists
    bootstrap_admin()

def bootstrap_admin():
    """Ensures at least one administrator account exists."""
    admin_email = os.environ.get('ADMIN_EMAIL', 'admin@spectre.io').strip().lower()
    admin_pass = os.environ.get('ADMIN_PASSWORD', 'spectre_admin_2026')

    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT id, tier FROM users WHERE email = ?", (admin_email,))
        user = cursor.fetchone()
        if not user:
            pw_hash = generate_password_hash(admin_pass)
            cursor.execute(
                "INSERT INTO users (email, password_hash, tier, notes) VALUES (?, ?, 'admin', 'Default Master Administrator')",
                (admin_email, pw_hash)
            )
            conn.commit()
            logger.info(f"Bootstrapped master admin user: {admin_email}")
        elif user['tier'] != 'admin':
            cursor.execute("UPDATE users SET tier = 'admin' WHERE id = ?", (user['id'],))
            conn.commit()

def create_user(email: str, password: str, tier: str = 'free') -> Dict[str, Any]:
    """Registers a new user with hashed password."""
    email = email.strip().lower()
    if not email or '@' not in email:
        raise ValueError("Valid email address required.")
    if len(password) < 6:
        raise ValueError("Password must be at least 6 characters long.")

    valid_tiers = ('free', 'premium', 'lifetime', 'admin')
    if tier not in valid_tiers:
        tier = 'free'

    # Auto-grant admin tier if email matches ADMIN_EMAIL env var
    configured_admin = os.environ.get('ADMIN_EMAIL', '').strip().lower()
    if configured_admin and email == configured_admin:
        tier = 'admin'

    pw_hash = generate_password_hash(password)

    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "INSERT INTO users (email, password_hash, tier) VALUES (?, ?, ?)",
                (email, pw_hash, tier)
            )
            conn.commit()
            user_id = cursor.lastrowid
            return get_user_by_id(user_id)
    except sqlite3.IntegrityError:
        raise ValueError("An account with this email already exists.")

def get_user_by_email(email: str) -> Optional[Dict[str, Any]]:
    """Retrieves user record by email address."""
    email = email.strip().lower()
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM users WHERE email = ?", (email,))
        row = cursor.fetchone()
        return dict(row) if row else None

def get_user_by_id(user_id: int) -> Optional[Dict[str, Any]]:
    """Retrieves user record by ID."""
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT id, email, tier, created_at, searches_count, last_login, notes FROM users WHERE id = ?", (user_id,))
        row = cursor.fetchone()
        return dict(row) if row else None

def authenticate_user(email: str, password: str) -> Optional[Dict[str, Any]]:
    """Validates email and password, updates last_login on success."""
    user = get_user_by_email(email)
    if not user:
        return None
    if not check_password_hash(user['password_hash'], password):
        return None

    # Update last login timestamp
    with get_db_connection() as conn:
        conn.execute("UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?", (user['id'],))
        conn.commit()

    user.pop('password_hash', None)
    return user

def update_user_tier(email: str, new_tier: str, admin_notes: str = "") -> Dict[str, Any]:
    """Updates a user's subscription tier (Free, Premium, Lifetime, Admin)."""
    email = email.strip().lower()
    new_tier = new_tier.strip().lower()
    valid_tiers = ('free', 'premium', 'lifetime', 'admin')
    if new_tier not in valid_tiers:
        raise ValueError(f"Invalid tier: {new_tier}. Must be one of {valid_tiers}")

    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT id, tier FROM users WHERE email = ?", (email,))
        user = cursor.fetchone()
        if not user:
            raise ValueError(f"No user found with email: {email}")

        note_append = f"Tier updated to {new_tier} at {time.strftime('%Y-%m-%d %H:%M:%SZ')}. {admin_notes}".strip()
        cursor.execute(
            "UPDATE users SET tier = ?, notes = ? WHERE email = ?",
            (new_tier, note_append, email)
        )
        # Record administrative transaction grant
        cursor.execute(
            "INSERT INTO payments (user_id, amount, currency, method, tier_granted, status) VALUES (?, 0.0, 'USD', 'admin_grant', ?, 'completed')",
            (user['id'], new_tier)
        )
        conn.commit()

    return get_user_by_email(email)

def list_all_users() -> List[Dict[str, Any]]:
    """Lists all users for the Admin panel with sanitized fields."""
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT id, email, tier, created_at, searches_count, last_login, notes 
            FROM users 
            ORDER BY id DESC
        """)
        return [dict(row) for row in cursor.fetchall()]

def increment_user_searches(user_id: int):
    """Increments search counter for a user."""
    with get_db_connection() as conn:
        conn.execute("UPDATE users SET searches_count = searches_count + 1 WHERE id = ?", (user_id,))
        conn.commit()

def record_payment(user_id: int, amount: float, method: str, tier_granted: str) -> int:
    """Records a payment and applies the granted tier to the user."""
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "INSERT INTO payments (user_id, amount, currency, method, tier_granted, status) VALUES (?, ?, 'USD', ?, ?, 'completed')",
            (user_id, amount, method, tier_granted)
        )
        cursor.execute(
            "UPDATE users SET tier = ? WHERE id = ?",
            (tier_granted, user_id)
        )
        conn.commit()
        return cursor.lastrowid
