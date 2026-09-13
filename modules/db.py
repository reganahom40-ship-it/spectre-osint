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

            CREATE TABLE IF NOT EXISTS vault_wallets (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                currency TEXT NOT NULL, -- 'LTC', 'BTC', 'ETH'
                address TEXT NOT NULL UNIQUE,
                encrypted_privkey TEXT NOT NULL,
                order_id TEXT DEFAULT '',
                balance REAL DEFAULT 0.0,
                status TEXT DEFAULT 'active', -- 'active', 'swept', 'reserved'
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS vault_withdrawals (
                id TEXT PRIMARY KEY,
                admin_email TEXT NOT NULL,
                currency TEXT NOT NULL,
                destination_address TEXT NOT NULL,
                amount REAL NOT NULL,
                tx_hash TEXT DEFAULT '',
                status TEXT DEFAULT 'completed',
                notes TEXT DEFAULT '',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS coupons (
                code TEXT PRIMARY KEY COLLATE NOCASE,
                discount_percent REAL DEFAULT 0,
                discount_amount REAL DEFAULT 0,
                max_uses INTEGER DEFAULT 0,
                times_used INTEGER DEFAULT 0,
                is_active INTEGER DEFAULT 1,
                expires_at TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS custom_payment_methods (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                fee_percent REAL DEFAULT 0.0,
                fee_fixed REAL DEFAULT 0.0,
                recipient_address TEXT DEFAULT '',
                instructions TEXT DEFAULT '',
                icon TEXT DEFAULT 'fas fa-wallet',
                badge TEXT DEFAULT '',
                is_enabled INTEGER DEFAULT 1,
                display_order INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
            CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
            CREATE INDEX IF NOT EXISTS idx_vault_currency ON vault_wallets(currency);
            CREATE INDEX IF NOT EXISTS idx_vault_address ON vault_wallets(address);
            CREATE INDEX IF NOT EXISTS idx_withdrawals_created ON vault_withdrawals(created_at);
            CREATE INDEX IF NOT EXISTS idx_coupons_code ON coupons(code);
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
    t_lower = (tier_granted or '').lower()
    if 'lifetime' in t_lower:
        norm_tier = 'lifetime'
    elif 'admin' in t_lower:
        norm_tier = 'admin'
    elif 'free' in t_lower:
        norm_tier = 'free'
    else:
        norm_tier = 'premium'

    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "INSERT INTO payments (user_id, amount, currency, method, tier_granted, status) VALUES (?, ?, 'USD', ?, ?, 'completed')",
            (user_id, amount, method, norm_tier)
        )
        cursor.execute(
            "UPDATE users SET tier = ? WHERE id = ?",
            (norm_tier, user_id)
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
        'PAYPAL_CLIENT_ID': os.environ.get('PAYPAL_CLIENT_ID', ''),
        'PAYPAL_CLIENT_SECRET': os.environ.get('PAYPAL_CLIENT_SECRET', ''),
        'PAYPAL_MODE': os.environ.get('PAYPAL_MODE', 'live'),
        'CASHAPP_TAG': os.environ.get('CASHAPP_TAG', '$SpectreIntel'),
        'CASHAPP_VERIFY_MODE': os.environ.get('CASHAPP_VERIFY_MODE', 'auto_note'),
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
        cursor.execute("SELECT COUNT(*) as cnt FROM custom_payment_methods")
        if cursor.fetchone()['cnt'] == 0:
            methods = [
                ('card', 'Credit / Debit Card (Stripe / Bank)', 3.5, 0.30, '', 'Instant activation via secured checkout', 'fas fa-credit-card', 'INSTANT', 1, 1),
                ('crypto', 'Cryptocurrency (LTC / BTC / ETH / SOL)', -5.0, 0.00, 'ltc1q4m9vzp0wx88m3q25974c4q5ek6l859e2y7mrh6u8', 'Decentralized anonymous blockchain settlement (5% OFF)', 'fa-brands fa-bitcoin', '5% DISCOUNT', 1, 2),
                ('cashapp', 'Cash App / Apple Pay', 0.0, 0.00, '$SpectreIntel', 'Send exact USD amount to $SpectreIntel and include your email in the note', 'fas fa-dollar-sign', 'POPULAR', 1, 3),
                ('paypal', 'PayPal (Friends & Family / Invoice)', 5.0, 0.00, 'payments@spectre.io', 'Send via PayPal Friends & Family to avoid holds', 'fa-brands fa-paypal', '+5% FEE', 1, 4),
                ('zelle', 'Zelle / Bank Direct', 0.0, 0.00, 'pay@spectre.io', 'Fast bank transfer with zero network fees', 'fas fa-building-columns', 'ZERO FEES', 1, 5),
                ('solana', 'Solana (SOL / USDC)', -5.0, 0.00, 'SPECTRE9vzp0wx88m3q25974c4q5ek6l859e2y7mrh6u8', 'Lightning-fast 400ms Solana confirmation', 'fas fa-bolt', '5% DISCOUNT', 1, 6),
                ('monero', 'Monero (XMR)', -10.0, 0.00, '888tNkZrPN6JsEihUmJ46e7f1K49...', '100% Anonymous untraceable private transaction (10% OFF)', 'fas fa-mask', '10% DISCOUNT', 1, 7)
            ]
            for m in methods:
                conn.execute("""
                    INSERT INTO custom_payment_methods (id, name, fee_percent, fee_fixed, recipient_address, instructions, icon, badge, is_enabled, display_order)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, m)

        cursor.execute("SELECT COUNT(*) as cnt FROM coupons")
        if cursor.fetchone()['cnt'] == 0:
            # Seed default starter coupon codes
            conn.execute("""
                INSERT INTO coupons (code, discount_percent, discount_amount, max_uses, times_used, is_active)
                VALUES ('ONYX20', 20.0, 0.0, 100, 0, 1)
            """)
            conn.execute("""
                INSERT INTO coupons (code, discount_percent, discount_amount, max_uses, times_used, is_active)
                VALUES ('LAUNCH50', 50.0, 0.0, 50, 0, 1)
            """)
        conn.commit()

# =========================================================================
# COUPONS & PROMO CODES ENGINE
# =========================================================================
def list_coupons() -> List[Dict[str, Any]]:
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM coupons ORDER BY created_at DESC")
        return [dict(r) for r in cursor.fetchall()]

def get_coupon(code: str) -> Optional[Dict[str, Any]]:
    if not code:
        return None
    code_norm = code.strip().upper()
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM coupons WHERE code = ?", (code_norm,))
        row = cursor.fetchone()
        return dict(row) if row else None

def save_coupon(code: str, discount_percent: float = 0.0, discount_amount: float = 0.0,
                max_uses: int = 0, is_active: int = 1, expires_at: Optional[str] = None) -> Dict[str, Any]:
    code_norm = code.strip().upper()
    if not code_norm:
        raise ValueError("Coupon code cannot be blank.")
    with get_db_connection() as conn:
        conn.execute("""
            INSERT INTO coupons (code, discount_percent, discount_amount, max_uses, is_active, expires_at)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(code) DO UPDATE SET
                discount_percent = excluded.discount_percent,
                discount_amount = excluded.discount_amount,
                max_uses = excluded.max_uses,
                is_active = excluded.is_active,
                expires_at = excluded.expires_at
        """, (code_norm, float(discount_percent), float(discount_amount), int(max_uses), int(is_active), expires_at))
        conn.commit()
    return get_coupon(code_norm)

def delete_coupon(code: str) -> bool:
    code_norm = code.strip().upper()
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM coupons WHERE code = ?", (code_norm,))
        conn.commit()
        return cursor.rowcount > 0

def validate_coupon(code: str, base_price: float) -> Dict[str, Any]:
    coupon = get_coupon(code)
    if not coupon:
        return {'valid': False, 'error': 'Invalid coupon code.'}
    if not coupon['is_active']:
        return {'valid': False, 'error': 'This coupon has been disabled.'}
    if coupon['max_uses'] > 0 and coupon['times_used'] >= coupon['max_uses']:
        return {'valid': False, 'error': 'This coupon has reached its maximum usage limit.'}
    if coupon.get('expires_at'):
        try:
            exp = datetime.strptime(coupon['expires_at'], '%Y-%m-%d %H:%M:%SZ')
            if datetime.utcnow() > exp:
                return {'valid': False, 'error': 'This coupon has expired.'}
        except Exception:
            pass

    discount = 0.0
    if coupon['discount_percent'] > 0:
        discount += (base_price * (coupon['discount_percent'] / 100.0))
    if coupon['discount_amount'] > 0:
        discount += coupon['discount_amount']

    discount = min(base_price, max(0.0, round(discount, 2)))
    final_price = max(0.0, round(base_price - discount, 2))

    return {
        'valid': True,
        'code': coupon['code'],
        'discount_percent': coupon['discount_percent'],
        'discount_amount': coupon['discount_amount'],
        'discount_total': discount,
        'final_price': final_price
    }

def increment_coupon_usage(code: str):
    if not code:
        return
    code_norm = code.strip().upper()
    with get_db_connection() as conn:
        conn.execute("UPDATE coupons SET times_used = times_used + 1 WHERE code = ?", (code_norm,))
        conn.commit()

# =========================================================================
# CUSTOM PAYMENT METHODS & SURCHARGE FEES ENGINE
# =========================================================================
def list_payment_methods(include_disabled: bool = False) -> List[Dict[str, Any]]:
    with get_db_connection() as conn:
        cursor = conn.cursor()
        if include_disabled:
            cursor.execute("SELECT * FROM custom_payment_methods ORDER BY display_order ASC, name ASC")
        else:
            cursor.execute("SELECT * FROM custom_payment_methods WHERE is_enabled = 1 ORDER BY display_order ASC, name ASC")
        return [dict(r) for r in cursor.fetchall()]

def get_payment_method(method_id: str) -> Optional[Dict[str, Any]]:
    if not method_id:
        return None
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM custom_payment_methods WHERE id = ?", (method_id.strip().lower(),))
        row = cursor.fetchone()
        return dict(row) if row else None

def save_payment_method(method_id: str, name: str, fee_percent: float = 0.0, fee_fixed: float = 0.0,
                        recipient_address: str = '', instructions: str = '', icon: str = 'fas fa-wallet',
                        badge: str = '', is_enabled: int = 1, display_order: int = 0) -> Dict[str, Any]:
    mid = method_id.strip().lower()
    with get_db_connection() as conn:
        conn.execute("""
            INSERT INTO custom_payment_methods (id, name, fee_percent, fee_fixed, recipient_address, instructions, icon, badge, is_enabled, display_order)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                name = excluded.name,
                fee_percent = excluded.fee_percent,
                fee_fixed = excluded.fee_fixed,
                recipient_address = excluded.recipient_address,
                instructions = excluded.instructions,
                icon = excluded.icon,
                badge = excluded.badge,
                is_enabled = excluded.is_enabled,
                display_order = excluded.display_order
        """, (mid, name, float(fee_percent), float(fee_fixed), recipient_address.strip(),
              instructions.strip(), icon.strip(), badge.strip(), int(is_enabled), int(display_order)))
        conn.commit()
    return get_payment_method(mid)

def delete_payment_method(method_id: str) -> bool:
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM custom_payment_methods WHERE id = ?", (method_id.strip().lower(),))
        conn.commit()
        return cursor.rowcount > 0

def calculate_checkout_total(base_price: float, coupon_code: Optional[str] = None, payment_method_id: Optional[str] = None) -> Dict[str, Any]:
    current_price = base_price
    coupon_data = None
    if coupon_code:
        v_res = validate_coupon(coupon_code, base_price)
        if v_res.get('valid'):
            coupon_data = v_res
            current_price = v_res['final_price']

    method = get_payment_method(payment_method_id) if payment_method_id else None
    fee_amount = 0.0
    if method:
        if method['fee_percent'] != 0.0:
            fee_amount += (current_price * (method['fee_percent'] / 100.0))
        if method['fee_fixed'] != 0.0:
            fee_amount += method['fee_fixed']

    final_total = max(0.0, round(current_price + fee_amount, 2))
    return {
        'base_price': base_price,
        'coupon': coupon_data,
        'payment_method': method,
        'fee_amount': round(fee_amount, 2),
        'final_total': final_total
    }

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
    
    # Determine target subscription tier from plan_id
    plan_lower = (plan_id or '').lower()
    if 'lifetime' in plan_lower:
        target_tier = 'lifetime'
    elif 'admin' in plan_lower:
        target_tier = 'admin'
    elif 'free' in plan_lower:
        target_tier = 'free'
    else:
        target_tier = 'premium'

    # Ensure user exists
    user = get_user_by_email(email)
    if not user:
        user = create_user(email, f"spectre_order_{int(time.time())}", tier=target_tier)
    
    # Apply tier upgrade
    update_user_tier(email, target_tier, f"Order {order_id} approved. {admin_notes}")
    record_payment(user['id'], amount, method, target_tier)

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

# =========================================================================
# PLATFORM TREASURY & CUSTODIAL VAULT
# =========================================================================
def save_vault_wallet(currency: str, address: str, encrypted_privkey: str,
                      order_id: str = '', balance: float = 0.0) -> Dict[str, Any]:
    currency = currency.strip().upper()
    address = address.strip()
    with get_db_connection() as conn:
        conn.execute("""
            INSERT INTO vault_wallets (currency, address, encrypted_privkey, order_id, balance, status)
            VALUES (?, ?, ?, ?, ?, 'active')
            ON CONFLICT(address) DO UPDATE SET
                order_id = excluded.order_id,
                balance = excluded.balance
        """, (currency, address, encrypted_privkey, order_id, float(balance)))
        conn.commit()
    return get_vault_wallet_by_address(address)

def get_vault_wallet_by_address(address: str) -> Optional[Dict[str, Any]]:
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM vault_wallets WHERE address = ?", (address.strip(),))
        row = cursor.fetchone()
        return dict(row) if row else None

def get_vault_wallet_by_order(order_id: str) -> Optional[Dict[str, Any]]:
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM vault_wallets WHERE order_id = ? ORDER BY id DESC LIMIT 1", (order_id.strip(),))
        row = cursor.fetchone()
        return dict(row) if row else None

def list_vault_wallets(currency: Optional[str] = None) -> List[Dict[str, Any]]:
    with get_db_connection() as conn:
        cursor = conn.cursor()
        if currency:
            cursor.execute("SELECT * FROM vault_wallets WHERE currency = ? ORDER BY id DESC", (currency.upper(),))
        else:
            cursor.execute("SELECT * FROM vault_wallets ORDER BY id DESC")
        return [dict(row) for row in cursor.fetchall()]

def update_vault_wallet_balance(address: str, balance: float) -> Optional[Dict[str, Any]]:
    with get_db_connection() as conn:
        conn.execute("UPDATE vault_wallets SET balance = ? WHERE address = ?", (float(balance), address.strip()))
        conn.commit()
    return get_vault_wallet_by_address(address)

def credit_vault_wallet(address: str, amount: float) -> Optional[Dict[str, Any]]:
    with get_db_connection() as conn:
        conn.execute("UPDATE vault_wallets SET balance = balance + ? WHERE address = ?", (float(amount), address.strip()))
        conn.commit()
    return get_vault_wallet_by_address(address)

def create_vault_withdrawal(admin_email: str, currency: str, destination_address: str,
                            amount: float, tx_hash: str = '', notes: str = '') -> Dict[str, Any]:
    withdrawal_id = f"WD-{uuid.uuid4().hex[:8].upper()}"
    currency = currency.strip().upper()
    now_str = datetime.utcnow().strftime('%Y-%m-%d %H:%M:%SZ')
    with get_db_connection() as conn:
        conn.execute("""
            INSERT INTO vault_withdrawals (id, admin_email, currency, destination_address, amount, tx_hash, status, notes, created_at)
            VALUES (?, ?, ?, ?, ?, ?, 'completed', ?, ?)
        """, (withdrawal_id, admin_email.strip().lower(), currency, destination_address.strip(),
              float(amount), tx_hash.strip(), notes.strip(), now_str))
        conn.commit()

        cursor = conn.cursor()
        cursor.execute("SELECT * FROM vault_withdrawals WHERE id = ?", (withdrawal_id,))
        row = cursor.fetchone()
        return dict(row) if row else {}

def list_vault_withdrawals(limit: int = 50) -> List[Dict[str, Any]]:
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM vault_withdrawals ORDER BY created_at DESC LIMIT ?", (int(limit),))
        return [dict(row) for row in cursor.fetchall()]

def get_vault_totals() -> Dict[str, Any]:
    """Calculates aggregate balances received, withdrawn, and available across all currencies."""
    totals = {}
    currencies = ['LTC', 'BTC', 'ETH']
    with get_db_connection() as conn:
        cursor = conn.cursor()
        for c in currencies:
            cursor.execute("SELECT COALESCE(SUM(balance), 0.0) as total_bal, COUNT(*) as wallet_count FROM vault_wallets WHERE currency = ?", (c,))
            w_row = cursor.fetchone()
            total_bal = float(w_row['total_bal'])
            wallet_count = int(w_row['wallet_count'])

            cursor.execute("SELECT COALESCE(SUM(amount), 0.0) as total_withdrawn FROM vault_withdrawals WHERE currency = ? AND status = 'completed'", (c,))
            wd_row = cursor.fetchone()
            total_withdrawn = float(wd_row['total_withdrawn'])

            available = max(0.0, total_bal - total_withdrawn)
            totals[c.lower()] = {
                'currency': c,
                'total_received': round(total_bal, 8),
                'total_withdrawn': round(total_withdrawn, 8),
                'available': round(available, 8),
                'wallet_count': wallet_count
            }
    return totals

