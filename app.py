from flask import Flask, request, jsonify, render_template, session, redirect
import datetime
import os
import re
import time

from modules.username import check_username
from modules.ip_lookup import lookup_ip
from modules.email_lookup import lookup_email
from modules.domain_lookup import lookup_domain
from modules.phone_lookup import lookup_phone
from modules.headers import analyze_headers
from modules.discord_lookup import lookup_discord
from modules.hash_lookup import analyze_hash
from modules.dork_generator import generate_dorks
from modules.bgp_lookup import lookup_bgp
from modules.number_forensics import analyze_number
from modules.engine import InvestigationEngine
from modules.logging_config import setup_logging, log_investigation_summary
from modules.payment_config import get_payment_config
from modules.crypto_rates import calculate_crypto_amount, get_crypto_rate
from modules.db import (
    init_db, create_user, authenticate_user, update_user_tier,
    list_all_users, record_payment, increment_user_searches, get_user_by_email,
    get_all_settings, set_setting, list_plans, get_plan, save_plan, delete_plan,
    create_order, get_order, update_order_proof, list_orders, approve_order, reject_order
)
from modules.auth import (
    get_current_user, login_user, logout_user, is_admin,
    has_tier, login_required, admin_required
)

setup_logging()
init_db()
engine = InvestigationEngine()

app = Flask(__name__, static_folder='static', template_folder='templates')
app.secret_key = os.environ.get('SECRET_KEY', 'spectre_master_secret_session_2026')
app.config['SESSION_COOKIE_HTTPONLY'] = True
app.config['SESSION_COOKIE_SAMESITE'] = 'Lax'

@app.after_request
def add_cors_headers(response):
    response.headers['Access-Control-Allow-Origin'] = '*'
    response.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization'
    response.headers['Access-Control-Allow-Methods'] = 'POST, GET, OPTIONS'
    response.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate, max-age=0'
    response.headers['Pragma'] = 'no-cache'
    response.headers['Expires'] = '0'
    return response

import time

_rate_limit_store = {}

def check_rate_limit(ip, max_requests=30, window=60):
    now = time.time()
    history = _rate_limit_store.get(ip, [])
    history = [t for t in history if now - t < window]
    if len(history) >= max_requests:
        return False
    history.append(now)
    _rate_limit_store[ip] = history
    return True

def get_param(key):
    if request.method == 'GET':
        val = str(request.args.get(key, ''))
    else:
        json_data = request.get_json(silent=True) or {}
        val = json_data.get(key)
        if val is None:
            val = request.form.get(key, '')
        val = str(val)
        
    val = val.replace('\x00', '').strip()
    if len(val) > 500:
        val = val[:500]
    return val

def make_response_json(success, module, query, data=None, error=None):
    return jsonify({
        'success': success,
        'module': module,
        'query': query,
        'data': data,
        'error': error,
        'timestamp': datetime.datetime.utcnow().isoformat() + 'Z'
    })

PUBLIC_API_PREFIXES = ('/api/auth/', '/api/payment/', '/api/public/', '/health', '/api/health')

@app.before_request
def before_request_access_guard():
    if request.path.startswith('/api/'):
        ip = request.remote_addr
        if not check_rate_limit(ip):
            return jsonify({'success': False, 'error': 'Rate limit exceeded'}), 429

        # Strictly paywall all OSINT intelligence APIs
        if not any(request.path.startswith(prefix) for prefix in PUBLIC_API_PREFIXES):
            user = get_current_user()
            if not user or user.get('tier') not in ('premium', 'lifetime', 'admin'):
                return jsonify({
                    'success': False,
                    'error': 'Active Membership Required. Please upgrade to Pro or Lifetime to access SPECTRE OSINT tools.',
                    'upgrade_required': True
                }), 403

@app.route('/', methods=['GET'])
def index():
    user = get_current_user()
    if user and user.get('tier') in ('premium', 'lifetime', 'admin'):
        return render_template('index.html', user=user)
    return render_template('landing.html', user=user)

@app.route('/app', methods=['GET'])
def member_dashboard():
    user = get_current_user()
    if not user or user.get('tier') not in ('premium', 'lifetime', 'admin'):
        return redirect('/?access=required')
    return render_template('index.html', user=user)

@app.route('/landing', methods=['GET'])
def landing_page():
    user = get_current_user()
    return render_template('landing.html', user=user)

@app.route('/logout', methods=['GET', 'POST'])
def direct_logout():
    logout_user()
    session.clear()
    resp = redirect('/?logged_out=1')
    resp.delete_cookie('session')
    return resp

@app.route('/health', methods=['GET'])
def health():
    return jsonify({'status': 'operational', 'timestamp': datetime.datetime.utcnow().isoformat() + 'Z'}), 200

# =========================================================================
# AUTHENTICATION & MEMBERSHIP ENGINE
# =========================================================================
@app.route('/api/auth/register', methods=['POST', 'OPTIONS'])
def api_auth_register():
    if request.method == 'OPTIONS':
        return '', 204
    email = get_param('email')
    password = get_param('password')
    try:
        user = create_user(email, password, tier='free')
        login_user(user)
        return jsonify({
            'success': True,
            'message': 'Account created successfully.',
            'user': user
        }), 201
    except ValueError as e:
        return jsonify({'success': False, 'error': str(e)}), 400
    except Exception as e:
        return jsonify({'success': False, 'error': 'Failed to create account.'}), 500

@app.route('/api/auth/login', methods=['POST', 'OPTIONS'])
def api_auth_login():
    if request.method == 'OPTIONS':
        return '', 204
    email = get_param('email')
    password = get_param('password')
    user = authenticate_user(email, password)
    if not user:
        return jsonify({'success': False, 'error': 'Invalid email or password.'}), 401
    login_user(user)
    return jsonify({
        'success': True,
        'message': 'Authentication successful.',
        'user': user
    }), 200

@app.route('/api/auth/logout', methods=['POST', 'GET', 'OPTIONS'])
def api_auth_logout():
    logout_user()
    return jsonify({'success': True, 'message': 'Logged out successfully.'}), 200

@app.route('/api/auth/me', methods=['GET', 'OPTIONS'])
def api_auth_me():
    if request.method == 'OPTIONS':
        return '', 204
    user = get_current_user()
    if not user:
        return jsonify({
            'success': True,
            'logged_in': False,
            'authenticated': False,
            'user': {
                'email': 'Guest (Unauthenticated)',
                'tier': 'free',
                'searches_count': session.get('guest_searches', 0),
                'is_admin': False
            }
        }), 200
    return jsonify({
        'success': True,
        'logged_in': True,
        'authenticated': True,
        'user': {
            'id': user['id'],
            'email': user['email'],
            'tier': user['tier'],
            'searches_count': user.get('searches_count', 0),
            'is_admin': is_admin(user),
            'created_at': user.get('created_at')
        }
    }), 200

# =========================================================================
# PAYMENT & SUBSCRIPTION CHECKOUT
# =========================================================================
@app.route('/api/payment/config', methods=['GET', 'OPTIONS'])
def api_payment_config():
    if request.method == 'OPTIONS':
        return '', 204
    return jsonify(get_payment_config()), 200

@app.route('/api/payment/create-order', methods=['POST', 'OPTIONS'])
def api_payment_create_order():
    if request.method == 'OPTIONS':
        return '', 204
    
    email = (get_param('email') or '').strip().lower()
    user = get_current_user()
    if not email and user:
        email = user['email']
    
    if not email or '@' not in email or '.' not in email:
        return jsonify({'success': False, 'error': 'A valid operator email address is required.'}), 400

    plan_id = (get_param('plan_id') or get_param('tier') or 'lifetime').strip().lower()
    method = (get_param('method') or get_param('payment_method') or 'ltc').strip().lower()

    # Determine price from plan or fallback
    plan = get_plan(plan_id)
    if plan:
        amount = float(plan['price'])
        plan_name = plan['name']
    else:
        amount = 99.0 if plan_id == 'lifetime' else 19.0
        plan_name = 'Lifetime Operator' if plan_id == 'lifetime' else 'Pro Analyst'

    cfg = get_payment_config()
    crypto_amount = 0.0
    deposit_address = ''

    if method == 'ltc':
        deposit_address = cfg.get('LTC_ADDRESS', '')
        crypto_amount = calculate_crypto_amount(amount, 'ltc')
    elif method == 'btc':
        deposit_address = cfg.get('BTC_ADDRESS', '')
        crypto_amount = calculate_crypto_amount(amount, 'btc')
    elif method == 'eth':
        deposit_address = cfg.get('ETH_ADDRESS', '')
        crypto_amount = calculate_crypto_amount(amount, 'eth')
    elif method == 'paypal':
        deposit_address = cfg.get('PAYPAL_EMAIL', '')
    elif method == 'cashapp':
        deposit_address = cfg.get('CASHAPP_TAG', '')
    elif method == 'card':
        deposit_address = 'Credit/Debit Gateway'

    order = create_order(
        email=email,
        plan_id=plan_id,
        amount=amount,
        payment_method=method,
        crypto_amount=crypto_amount,
        deposit_address=deposit_address,
        expires_minutes=45
    )

    return jsonify({
        'success': True,
        'order': order,
        'payment_instructions': {
            'order_id': order['id'],
            'email': email,
            'plan_id': plan_id,
            'plan_name': plan_name,
            'amount_usd': amount,
            'crypto_amount': crypto_amount,
            'method': method,
            'deposit_address': deposit_address,
            'paypal_link': cfg.get('PAYPAL_LINK', ''),
            'paypal_email': cfg.get('PAYPAL_EMAIL', ''),
            'cashapp_tag': cfg.get('CASHAPP_TAG', ''),
            'expires_at': order['expires_at']
        }
    }), 200

@app.route('/api/payment/submit-proof', methods=['POST', 'OPTIONS'])
def api_payment_submit_proof():
    if request.method == 'OPTIONS':
        return '', 204
    
    order_id = (get_param('order_id') or '').strip().upper()
    tx_hash = (get_param('tx_hash') or get_param('hash') or get_param('proof') or '').strip()
    notes = (get_param('notes') or '').strip()

    if not order_id:
        return jsonify({'success': False, 'error': 'Order ID is required.'}), 400
    
    order = get_order(order_id)
    if not order:
        return jsonify({'success': False, 'error': f'Order {order_id} was not found.'}), 404

    if not tx_hash or len(tx_hash) < 5:
        return jsonify({'success': False, 'error': 'Please provide a valid transaction hash (TXID) or transfer reference identifier.'}), 400

    updated = update_order_proof(order_id, tx_hash, notes)
    return jsonify({
        'success': True,
        'message': 'Payment proof submitted. Order is now queued for network verification and operator clearance.',
        'order': updated
    }), 200

@app.route('/api/payment/order-status/<order_id>', methods=['GET', 'OPTIONS'])
def api_payment_order_status(order_id):
    if request.method == 'OPTIONS':
        return '', 204
    order_id = (order_id or '').strip().upper()
    order = get_order(order_id)
    if not order:
        return jsonify({'success': False, 'error': 'Order not found'}), 404

    is_approved = (order['status'] == 'approved')
    if is_approved:
        user = get_user_by_email(order['email'])
        if user:
            login_user(user)

    return jsonify({
        'success': True,
        'order': order,
        'approved': is_approved,
        'redirect': '/app' if is_approved else None
    }), 200

@app.route('/api/payment/checkout', methods=['POST', 'OPTIONS'])
def api_payment_checkout():
    if request.method == 'OPTIONS':
        return '', 204
    # Real checkout redirects to create-order to avoid fake instant upgrades
    return api_payment_create_order()

# =========================================================================
# MASTER ADMIN MANAGEMENT PORTAL
# =========================================================================
@app.route('/api/admin/users', methods=['GET', 'OPTIONS'])
@admin_required
def api_admin_users():
    if request.method == 'OPTIONS':
        return '', 204
    users = list_all_users()
    return jsonify({
        'success': True,
        'users': users,
        'total_count': len(users)
    }), 200

@app.route('/api/admin/upgrade', methods=['POST', 'OPTIONS'])
@admin_required
def api_admin_upgrade():
    if request.method == 'OPTIONS':
        return '', 204
    target_email = get_param('email')
    target_tier = get_param('tier') or 'lifetime'
    notes = get_param('notes') or 'Direct Admin Upgrade'

    if not target_email:
        return jsonify({'success': False, 'error': 'Missing target user email.'}), 400

    try:
        updated_user = update_user_tier(target_email, target_tier, notes)
        return jsonify({
            'success': True,
            'message': f"Account {target_email} successfully upgraded to {target_tier.upper()}.",
            'tier': target_tier,
            'user': updated_user
        }), 200
    except ValueError as e:
        return jsonify({'success': False, 'error': str(e)}), 400
    except Exception as e:
        return jsonify({'success': False, 'error': f"Failed to upgrade user: {str(e)}"}), 500

@app.route('/api/public/plans', methods=['GET', 'OPTIONS'])
def api_public_plans():
    if request.method == 'OPTIONS':
        return '', 204
    plans = list_plans(include_inactive=False)
    return jsonify({'success': True, 'plans': plans}), 200

@app.route('/api/admin/settings', methods=['GET', 'POST', 'OPTIONS'])
@admin_required
def api_admin_settings():
    if request.method == 'OPTIONS':
        return '', 204
    if request.method == 'GET':
        return jsonify({
            'success': True,
            'settings': get_payment_config()
        }), 200
    
    # Update payment addresses & cashtags
    keys = ['LTC_ADDRESS', 'BTC_ADDRESS', 'ETH_ADDRESS', 'PAYPAL_EMAIL', 'PAYPAL_LINK', 'CASHAPP_TAG']
    for k in keys:
        val = get_param(k)
        if val is not None and val != '':
            set_setting(k, val)
    return jsonify({
        'success': True,
        'message': 'Payment settings and settlement routing updated successfully.',
        'settings': get_payment_config()
    }), 200

@app.route('/api/admin/plans', methods=['GET', 'POST', 'OPTIONS'])
@admin_required
def api_admin_plans():
    if request.method == 'OPTIONS':
        return '', 204
    if request.method == 'GET':
        plans = list_plans(include_inactive=True)
        return jsonify({'success': True, 'plans': plans}), 200

    plan_id = (get_param('id') or get_param('plan_id') or '').strip().lower()
    name = get_param('name').strip()
    price = float(get_param('price') or 0.0)
    billing_period = get_param('billing_period') or 'one-time'
    description = get_param('description') or ''
    badge = get_param('badge') or ''
    features_raw = get_param('features') or ''
    is_active = int(get_param('is_active') or 1)
    display_order = int(get_param('display_order') or 0)

    if not plan_id or not name:
        return jsonify({'success': False, 'error': 'Plan ID and Name are required.'}), 400

    saved = save_plan(plan_id, name, price, billing_period, description, badge, features_raw, is_active, display_order)
    return jsonify({'success': True, 'message': f'Plan {name} saved successfully.', 'plan': saved}), 200

@app.route('/api/admin/plans/<plan_id>', methods=['DELETE', 'OPTIONS'])
@admin_required
def api_admin_delete_plan(plan_id):
    if request.method == 'OPTIONS':
        return '', 204
    if plan_id in ('premium', 'lifetime'):
        # For base default plans, deactivate rather than purge
        save_plan(plan_id, name=plan_id.title(), price=0.0, billing_period='', is_active=0)
        return jsonify({'success': True, 'message': f'Plan {plan_id} deactivated.'}), 200
    deleted = delete_plan(plan_id)
    return jsonify({'success': deleted, 'message': f'Plan {plan_id} deleted.' if deleted else 'Plan not found.'}), 200

# =========================================================================
# ADMIN ORDERS & PAYMENT VERIFICATION QUEUE
# =========================================================================
@app.route('/api/admin/orders', methods=['GET', 'OPTIONS'])
@admin_required
def api_admin_orders():
    if request.method == 'OPTIONS':
        return '', 204
    status_filter = get_param('status')
    orders = list_orders(status_filter)
    return jsonify({
        'success': True,
        'orders': orders,
        'count': len(orders)
    }), 200

@app.route('/api/admin/orders/<order_id>/approve', methods=['POST', 'OPTIONS'])
@admin_required
def api_admin_approve_order(order_id):
    if request.method == 'OPTIONS':
        return '', 204
    order_id = (order_id or '').strip().upper()
    admin_notes = get_param('notes') or 'Verified by Admin'
    try:
        approved = approve_order(order_id, admin_notes)
        return jsonify({
            'success': True,
            'message': f"Order {order_id} approved. Account {approved['email']} elevated to {approved['plan_id'].upper()}.",
            'order': approved
        }), 200
    except ValueError as e:
        return jsonify({'success': False, 'error': str(e)}), 404
    except Exception as e:
        return jsonify({'success': False, 'error': f"Failed to approve order: {str(e)}"}), 500

@app.route('/api/admin/orders/<order_id>/reject', methods=['POST', 'OPTIONS'])
@admin_required
def api_admin_reject_order(order_id):
    if request.method == 'OPTIONS':
        return '', 204
    order_id = (order_id or '').strip().upper()
    reason = get_param('reason') or 'Transaction hash invalid or unconfirmed'
    try:
        rejected = reject_order(order_id, reason)
        return jsonify({
            'success': True,
            'message': f"Order {order_id} marked as rejected.",
            'order': rejected
        }), 200
    except ValueError as e:
        return jsonify({'success': False, 'error': str(e)}), 404
    except Exception as e:
        return jsonify({'success': False, 'error': f"Failed to reject order: {str(e)}"}), 500

# =========================================================================
# OMNI-RECON AUTO-DETECTION ENGINE (TIER GATED)
# =========================================================================
@app.route('/api/investigate', methods=['GET', 'POST', 'OPTIONS'])
@app.route('/api/omni', methods=['GET', 'POST', 'OPTIONS'])
def api_omni():
    if request.method == 'OPTIONS':
        return '', 204
    target = get_param('target') or get_param('q') or get_param('query')
    if not target:
        return make_response_json(False, 'omni', '', error='Missing target query string'), 400

    target = target.strip()

    # User & Tier evaluation
    user = get_current_user()
    user_tier = user['tier'] if user else 'free'
    is_privileged = user_tier in ('premium', 'lifetime', 'admin')

    # Strictly require paid membership (No free tier)
    if not is_privileged:
        return jsonify({
            'success': False,
            'error': 'Active Membership Required. Please upgrade to Pro or Lifetime to access SPECTRE OSINT tools.',
            'upgrade_required': True
        }), 403

    if user:
        increment_user_searches(user['id'])

    try:
        resp_data = engine.investigate(target)

        log_investigation_summary(
            resp_data.get('investigation_id', ''),
            target,
            resp_data.get('detected_type', 'unknown'),
            resp_data.get('duration_ms', 0.0),
            len(resp_data.get('errors', []))
        )
        return jsonify({
            'success': True,
            'module': 'omni',
            'query': target,
            'data': resp_data,
            **resp_data
        }), 200
    except Exception as e:
        return make_response_json(False, 'omni', target, error=str(e)), 500

@app.route('/api/breaches', methods=['GET', 'POST', 'OPTIONS'])
def api_breaches():
    if request.method == 'OPTIONS':
        return '', 204
    email = get_param('email') or get_param('target') or get_param('q')
    if not email:
        return make_response_json(False, 'breaches', '', error='Missing email target'), 400
    try:
        breaches_res = engine.hibp_breach_provider.search(email)
        pastes_res = engine.hibp_paste_provider.search(email)
        
        # Calculate risk score
        b_sum_data = breaches_res.data or {}
        p_data = pastes_res.data or {}
        
        breaches_list = [
            BreachRecord(**b) if isinstance(b, dict) and 'name' in b else b
            for b in b_sum_data.get('breaches', [])
        ]
        pastes_list = [
            PasteRecord(**p) if isinstance(p, dict) and 'source' in p else p
            for p in p_data.get('pastes', [])
        ]
        summary = BreachSummary(
            email=email,
            total_breaches=b_sum_data.get('total_breaches', len(breaches_list)),
            total_pastes=p_data.get('total_pastes', len(pastes_list)),
            earliest_breach=b_sum_data.get('earliest_breach', ''),
            latest_breach=b_sum_data.get('latest_breach', ''),
            total_records_exposed=b_sum_data.get('total_records_exposed', 0),
            unique_data_classes=b_sum_data.get('unique_data_classes', []),
            breaches=breaches_list,
            pastes=pastes_list
        )
        risk = engine.risk_engine.calculate(summary)
        
        return jsonify({
            'success': True,
            'module': 'breaches',
            'query': email,
            'data': {
                'summary': summary.to_dict(),
                'risk': risk.to_dict(),
                'breaches': [b.to_dict() for b in breaches_list],
                'pastes': [p.to_dict() for p in pastes_list]
            },
            'timestamp': datetime.datetime.utcnow().isoformat() + 'Z'
        }), 200
    except Exception as e:
        return make_response_json(False, 'breaches', email, error=str(e)), 500

# =========================================================================
# DEDICATED INDIVIDUAL API ROUTES
# =========================================================================
@app.route('/api/number', methods=['GET', 'POST', 'OPTIONS'])
def api_number():
    if request.method == 'OPTIONS':
        return '', 204
    number_query = get_param('number') or get_param('target') or get_param('q')
    if not number_query:
        return make_response_json(False, 'number', '', error='Missing number parameter'), 400
    try:
        result = analyze_number(number_query)
        return make_response_json(True, 'number', number_query, data=result), 200
    except Exception as e:
        return make_response_json(False, 'number', number_query, error=str(e)), 500

@app.route('/api/username', methods=['GET', 'POST', 'OPTIONS'])
def api_username():
    if request.method == 'OPTIONS':
        return '', 204
    username = get_param('username')
    if not username:
        return make_response_json(False, 'username', '', error='Missing username'), 400
    try:
        result = check_username(username)
        return make_response_json(True, 'username', username, data=result), 200
    except ValueError as e:
        return make_response_json(False, 'username', username, error=str(e)), 400
    except Exception:
        return make_response_json(False, 'username', username, error='Internal server error'), 500

@app.route('/api/discord', methods=['GET', 'POST', 'OPTIONS'])
def api_discord():
    if request.method == 'OPTIONS':
        return '', 204
    discord_id = get_param('id')
    if not discord_id:
        return make_response_json(False, 'discord', '', error='Missing Discord ID'), 400
    try:
        result = lookup_discord(discord_id)
        return make_response_json(True, 'discord', discord_id, data=result), 200
    except ValueError as e:
        return make_response_json(False, 'discord', discord_id, error=str(e)), 400
    except Exception:
        return make_response_json(False, 'discord', discord_id, error='Failed to query Discord ID'), 500

@app.route('/api/ip', methods=['GET', 'POST', 'OPTIONS'])
def api_ip():
    if request.method == 'OPTIONS':
        return '', 204
    ip = get_param('ip')
    if not ip:
        return make_response_json(False, 'ip', '', error='Missing IP address'), 400
    try:
        result = lookup_ip(ip)
        return make_response_json(True, 'ip', ip, data=result), 200
    except ValueError as e:
        return make_response_json(False, 'ip', ip, error=str(e)), 400
    except Exception:
        return make_response_json(False, 'ip', ip, error='Failed to resolve IP intelligence'), 500

@app.route('/api/email', methods=['GET', 'POST', 'OPTIONS'])
def api_email():
    if request.method == 'OPTIONS':
        return '', 204
    email = get_param('email')
    if not email:
        return make_response_json(False, 'email', '', error='Missing email'), 400
    try:
        result = lookup_email(email)
        return make_response_json(True, 'email', email, data=result), 200
    except ValueError as e:
        return make_response_json(False, 'email', email, error=str(e)), 400
    except Exception:
        return make_response_json(False, 'email', email, error='Failed to process email intelligence'), 500

@app.route('/api/domain', methods=['GET', 'POST', 'OPTIONS'])
def api_domain():
    if request.method == 'OPTIONS':
        return '', 204
    domain = get_param('domain')
    if not domain:
        return make_response_json(False, 'domain', '', error='Missing domain'), 400
    try:
        result = lookup_domain(domain)
        return make_response_json(True, 'domain', domain, data=result), 200
    except ValueError as e:
        return make_response_json(False, 'domain', domain, error=str(e)), 400
    except Exception:
        return make_response_json(False, 'domain', domain, error='Failed to execute domain recon'), 500

@app.route('/api/phone', methods=['GET', 'POST', 'OPTIONS'])
def api_phone():
    if request.method == 'OPTIONS':
        return '', 204
    phone = get_param('phone')
    if not phone:
        return make_response_json(False, 'phone', '', error='Missing phone number'), 400
    try:
        result = lookup_phone(phone)
        return make_response_json(True, 'phone', phone, data=result), 200
    except ValueError as e:
        return make_response_json(False, 'phone', phone, error=str(e)), 400
    except Exception:
        return make_response_json(False, 'phone', phone, error='Failed to analyze phone number'), 500

@app.route('/api/headers', methods=['GET', 'POST', 'OPTIONS'])
def api_headers():
    if request.method == 'OPTIONS':
        return '', 204
    url = get_param('url')
    if not url:
        return make_response_json(False, 'headers', '', error='Missing URL'), 400
    try:
        result = analyze_headers(url)
        return make_response_json(True, 'headers', url, data=result), 200
    except ValueError as e:
        return make_response_json(False, 'headers', url, error=str(e)), 400
    except Exception:
        return make_response_json(False, 'headers', url, error='Failed to fetch HTTP headers'), 500

@app.route('/api/hash', methods=['GET', 'POST', 'OPTIONS'])
def api_hash():
    if request.method == 'OPTIONS':
        return '', 204
    hash_val = get_param('hash')
    if not hash_val:
        return make_response_json(False, 'hash', '', error='Missing hash string'), 400
    try:
        result = analyze_hash(hash_val)
        return make_response_json(True, 'hash', hash_val, data=result), 200
    except ValueError as e:
        return make_response_json(False, 'hash', hash_val, error=str(e)), 400
    except Exception:
        return make_response_json(False, 'hash', hash_val, error='Failed to analyze hash'), 500

@app.route('/api/dorks', methods=['GET', 'POST', 'OPTIONS'])
def api_dorks():
    if request.method == 'OPTIONS':
        return '', 204
    target = get_param('target')
    if not target:
        return make_response_json(False, 'dorks', '', error='Missing target domain / keyword'), 400
    try:
        result = generate_dorks(target)
        return make_response_json(True, 'dorks', target, data=result), 200
    except ValueError as e:
        return make_response_json(False, 'dorks', target, error=str(e)), 400
    except Exception:
        return make_response_json(False, 'dorks', target, error='Failed to generate dorks'), 500

@app.route('/api/bgp', methods=['GET', 'POST', 'OPTIONS'])
def api_bgp():
    if request.method == 'OPTIONS':
        return '', 204
    asn_query = get_param('asn')
    if not asn_query:
        return make_response_json(False, 'bgp', '', error='Missing ASN number'), 400
    try:
        result = lookup_bgp(asn_query)
        return make_response_json(True, 'bgp', asn_query, data=result), 200
    except ValueError as e:
        return make_response_json(False, 'bgp', asn_query, error=str(e)), 400
    except Exception:
        return make_response_json(False, 'bgp', asn_query, error='Failed to query BGP routing data'), 500

@app.errorhandler(404)
def not_found(error):
    return jsonify({'success': False, 'error': 'Not found'}), 404

@app.errorhandler(500)
def internal_error(error):
    return jsonify({'success': False, 'error': 'Internal server error'}), 500

if __name__ == '__main__':
    import os
    port = int(os.environ.get('PORT', 5000))
    debug = os.environ.get('FLASK_DEBUG', 'true').lower() == 'true'
    app.run(debug=debug, host='0.0.0.0', port=port)
