"""
Database engine for SPECTRE OSINT platform.
SQLite-backed persistence for users, subscription tiers, search quotas, and payments.
Zero external dependencies.
"""
import sqlite3
import os
import time
import json
import logging
import uuid
from datetime import datetime, timedelta
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
    """Initializes schema for users, subscriptions, settings, plans, and transactions."""
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

            CREATE TABLE IF NOT EXISTS system_settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS pricing_plans (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                price REAL NOT NULL,
                billing_period TEXT NOT NULL,
                description TEXT DEFAULT '',
                badge TEXT DEFAULT '',
                features TEXT DEFAULT '[]',
                is_active INTEGER DEFAULT 1,
                display_order INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS orders (
                id TEXT PRIMARY KEY,
                user_id INTEGER,
                email TEXT NOT NULL,
                plan_id TEXT NOT NULL,
                amount REAL NOT NULL,
                currency TEXT DEFAULT 'USD',
                payment_method TEXT NOT NULL,
                crypto_amount REAL DEFAULT 0,
                deposit_address TEXT DEFAULT '',
                tx_hash TEXT DEFAULT '',
                status TEXT DEFAULT 'pending', -- 'pending', 'verifying', 'approved', 'rejected', 'expired'
                notes TEXT DEFAULT '',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                expires_at TIMESTAMP,
                approved_at TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users (id)
            );

            CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
            CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
        """)
        conn.commit()

    # Automatically bootstrap default master admin and plans
    bootstrap_admin()
    seed_default_plans_and_settings()

def bootstrap_admin():
    """Ensures at least one administrator account exists."""
    admin_email = os.environ.get('ADMIN_EMAIL', 'admin@spectre.io').strip().lower()
    admin_pass = os.environ.get('ADMIN_PASSWORD', 'spectre_admin_2026')

    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT id, tier FROM users WHERE email = ?", (admin_email,))
        user = cursor.fetchone()
        pw_hash = generate_password_hash(admin_pass)
        if not user:
            cursor.execute(
                "INSERT INTO users (email, password_hash, tier, notes) VALUES (?, ?, 'admin', 'Default Master Administrator')",
                (admin_email, pw_hash)
            )
            conn.commit()
            logger.info(f"Bootstrapped master admin user: {admin_email}")
        else:
            cursor.execute("UPDATE users SET tier = 'admin', password_hash = ? WHERE id = ?", (pw_hash, user['id']))
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

# =========================================================================
# SYSTEM SETTINGS & PAYMENT CONFIGURATION
# =========================================================================
def get_setting(key: str, default: Optional[str] = None) -> Optional[str]:
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT value FROM system_settings WHERE key = ?", (key,))
        row = cursor.fetchone()
        return row['value'] if row else default

def set_setting(key: str, value: str):
    with get_db_connection() as conn:
        conn.execute(
            "INSERT INTO system_settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP) "
            "ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP",
            (key, str(value).strip())
        )
        conn.commit()

def get_all_settings() -> Dict[str, str]:
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT key, value FROM system_settings")
        return {row['key']: row['value'] for row in cursor.fetchall()}

# =========================================================================
# PRICING PLANS & MONETIZATION PACKAGES
# =========================================================================
def list_plans(include_inactive: bool = False) -> List[Dict[str, Any]]:
    with get_db_connection() as conn:
        cursor = conn.cursor()
        if include_inactive:
            cursor.execute("SELECT * FROM pricing_plans ORDER BY display_order ASC, price ASC")
        else:
            cursor.execute("SELECT * FROM pricing_plans WHERE is_active = 1 ORDER BY display_order ASC, price ASC")
        
        plans = []
        for r in cursor.fetchall():
            p = dict(r)
            try:
                p['features'] = json.loads(p['features']) if p['features'] else []
            except Exception:
                p['features'] = []
            plans.append(p)
        return plans

def get_plan(plan_id: str) -> Optional[Dict[str, Any]]:
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM pricing_plans WHERE id = ?", (plan_id,))
        row = cursor.fetchone()
        if not row:
            return None
        p = dict(row)
        try:
            p['features'] = json.loads(p['features']) if p['features'] else []
        except Exception:
            p['features'] = []
        return p

def save_plan(plan_id: str, name: str, price: float, billing_period: str, description: str = '',
              badge: str = '', features: Any = None, is_active: int = 1, display_order: int = 0) -> Dict[str, Any]:
    if isinstance(features, (list, tuple)):
        features_json = json.dumps(features)
    elif isinstance(features, str):
        try:
            json.loads(features)
            features_json = features
        except Exception:
            features_json = json.dumps([f.strip() for f in features.split('\n') if f.strip()])
    else:
        features_json = '[]'

    with get_db_connection() as conn:
        conn.execute("""
            INSERT INTO pricing_plans (id, name, price, billing_period, description, badge, features, is_active, display_order)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                name = excluded.name,
                price = excluded.price,
                billing_period = excluded.billing_period,
                description = excluded.description,
                badge = excluded.badge,
                features = excluded.features,
                is_active = excluded.is_active,
                display_order = excluded.display_order
        """, (plan_id, name, float(price), billing_period, description, badge, features_json, int(is_active), int(display_order)))
        conn.commit()
    return get_plan(plan_id)

def delete_plan(plan_id: str) -> bool:
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM pricing_plans WHERE id = ?", (plan_id,))
        conn.commit()
        return cursor.rowcount > 0

def seed_default_plans_and_settings():
    """Initializes default payment routing and default pricing tiers if empty."""
    default_settings = {
        'LTC_ADDRESS': os.environ.get('LTC_ADDRESS', 'ltc1q4m9vzp0wx88m3q25974c4q5ek6l859e2y7mrh6u8'),
        'BTC_ADDRESS': os.environ.get('BTC_ADDRESS', 'bc1q9vzp0wx88m3q25974c4q5ek6l859e2y7mrh6u8'),
        'ETH_ADDRESS': os.environ.get('ETH_ADDRESS', '0x71C7656EC7ab88b098defB751B7401B5f6d8976F'),
        'PAYPAL_EMAIL': os.environ.get('PAYPAL_EMAIL', 'payments@spectre.io'),
        'PAYPAL_LINK': os.environ.get('PAYPAL_LINK', 'https://paypal.me/SpectreIntel'),
        'CASHAPP_TAG': os.environ.get('CASHAPP_TAG', '$SpectreIntel'),
    }
    with get_db_connection() as conn:
        for k, v in default_settings.items():
            conn.execute("INSERT OR IGNORE INTO system_settings (key, value) VALUES (?, ?)", (k, v))

        # Check existing plans
        cursor = conn.cursor()
        cursor.execute("SELECT COUNT(*) as cnt FROM pricing_plans")
        if cursor.fetchone()['cnt'] == 0:
            default_pro_features = json.dumps([
                "All 6 Deep Recon Vectors (IP, Domain, BGP, Phone, Social, Hash)",
                "Live BGP Routing & Autonomous System Intelligence",
                "Breach & Compromise Feed Correlation (HIBP)",
                "Interactive 3D Graph Studio & Clustering",
                "Full Unredacted Intelligence Dossier Exports",
                "High-Speed Priority Circuit Breakers"
            ])
            default_lifetime_features = json.dumps([
                "Everything in Pro Tier Forever",
                "Zero Recurring Subscriptions or Expirations",
                "Unlimited Concurrent Graph Query Engines",
                "Direct Raw JSON/Markdown API Token Access",
                "All Future Recon Modules & Zero-Day Feeds",
                "VIP Direct Telegram & Operator Channel Access"
            ])
            conn.execute("""
                INSERT INTO pricing_plans (id, name, price, billing_period, description, badge, features, is_active, display_order)
                VALUES ('premium', 'Pro Operator', 19.00, '/ month', 'Professional grade intelligence suite for active investigators.', 'POPULAR', ?, 1, 1)
            """, (default_pro_features,))
            conn.execute("""
                INSERT INTO pricing_plans (id, name, price, billing_period, description, badge, features, is_active, display_order)
                VALUES ('lifetime', 'Lifetime Operator', 99.00, 'one-time', 'Permanent uncapped intelligence command for elite operators.', 'BEST VALUE', ?, 1, 2)
            """, (default_lifetime_features,))
        conn.commit()

# =========================================================================
# ORDERS & PAYMENT VERIFICATION PIPELINE
# =========================================================================
def create_order(email: str, plan_id: str, amount: float, payment_method: str,
                 crypto_amount: float = 0.0, deposit_address: str = '', expires_minutes: int = 45) -> Dict[str, Any]:
    email = email.strip().lower()
    user = get_user_by_email(email)
    user_id = user['id'] if user else None
    
    order_id = f"SPEC-{uuid.uuid4().hex[:8].upper()}"
    now = datetime.utcnow()
    expires_at = (now + timedelta(minutes=expires_minutes)).strftime('%Y-%m-%d %H:%M:%SZ')
    created_at = now.strftime('%Y-%m-%d %H:%M:%SZ')

    with get_db_connection() as conn:
        conn.execute("""
            INSERT INTO orders (id, user_id, email, plan_id, amount, currency, payment_method,
                                crypto_amount, deposit_address, status, created_at, expires_at)
            VALUES (?, ?, ?, ?, ?, 'USD', ?, ?, ?, 'pending', ?, ?)
        """, (order_id, user_id, email, plan_id, float(amount), payment_method,
              float(crypto_amount), deposit_address, created_at, expires_at))
        conn.commit()
    return get_order(order_id)

def get_order(order_id: str) -> Optional[Dict[str, Any]]:
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM orders WHERE id = ?", (order_id,))
        row = cursor.fetchone()
        return dict(row) if row else None

def update_order_proof(order_id: str, tx_hash: str, user_notes: str = '') -> Optional[Dict[str, Any]]:
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            UPDATE orders
            SET tx_hash = ?, notes = ?, status = 'verifying'
            WHERE id = ?
        """, (tx_hash.strip(), user_notes.strip(), order_id))
        conn.commit()
    return get_order(order_id)

def list_orders(status_filter: Optional[str] = None) -> List[Dict[str, Any]]:
    with get_db_connection() as conn:
        cursor = conn.cursor()
        if status_filter:
            cursor.execute("SELECT * FROM orders WHERE status = ? ORDER BY id DESC", (status_filter,))
        else:
            cursor.execute("SELECT * FROM orders ORDER BY id DESC")
        return [dict(row) for row in cursor.fetchall()]

def approve_order(order_id: str, admin_notes: str = '') -> Dict[str, Any]:
    order = get_order(order_id)
    if not order:
        raise ValueError(f"Order {order_id} not found.")

    email = order['email']
    plan_id = order['plan_id']
    amount = order['amount']
    method = order['payment_method']
    
    # Ensure user exists
    user = get_user_by_email(email)
    if not user:
        user = create_user(email, f"spectre_order_{int(time.time())}", tier=plan_id)
    
    # Apply tier upgrade
    update_user_tier(email, plan_id, f"Order {order_id} approved. {admin_notes}")
    record_payment(user['id'], amount, method, plan_id)

    now_str = datetime.utcnow().strftime('%Y-%m-%d %H:%M:%SZ')
    with get_db_connection() as conn:
        conn.execute("""
            UPDATE orders
            SET status = 'approved', approved_at = ?, notes = ?
            WHERE id = ?
        """, (now_str, f"Approved by admin. {admin_notes}".strip(), order_id))
        conn.commit()

    return get_order(order_id)

def reject_order(order_id: str, reason: str = '') -> Dict[str, Any]:
    order = get_order(order_id)
    if not order:
        raise ValueError(f"Order {order_id} not found.")

    with get_db_connection() as conn:
        conn.execute("""
            UPDATE orders
            SET status = 'rejected', notes = ?
            WHERE id = ?
        """, (f"Rejected: {reason}".strip(), order_id))
        conn.commit()

    return get_order(order_id)
