"""
Unit tests for SPECTRE Authentication, Database, Admin Upgrades, and Payment Checkout.
"""
import os
import json
from app import app
from modules.db import init_db, get_user_by_email, create_user, authenticate_user, update_user_tier, list_all_users

def test_user_registration_and_hashing():
    init_db()
    test_email = "test_recon_unit@spectre.io"
    test_pass = "ReconPassword123!"
    
    # Clean up or check if user exists
    existing = get_user_by_email(test_email)
    if not existing:
        user = create_user(test_email, test_pass)
        assert user['email'] == test_email
        assert user['tier'] == 'free'
    
    # Authenticate check
    verified = authenticate_user(test_email, test_pass)
    assert verified is not None, "Failed to authenticate registered user"
    assert verified['email'] == test_email
    assert verified['tier'] in ['free', 'premium', 'lifetime', 'admin']
    assert 'password_hash' not in verified, "Password hash must not be leaked in returned user dict"

def test_tier_upgrade_and_persistence():
    test_email = "upgrade_target@spectre.io"
    if not get_user_by_email(test_email):
        create_user(test_email, "SecretPass777")
    
    # Upgrade to lifetime
    updated = update_user_tier(test_email, "lifetime")
    assert updated is not None
    assert updated['tier'] == "lifetime"
    
    user = get_user_by_email(test_email)
    assert user is not None
    assert user['tier'] == "lifetime"

    # Downgrade to premium
    updated2 = update_user_tier(test_email, "premium")
    assert updated2 is not None
    assert updated2['tier'] == "premium"

def test_admin_upgrade_api_routes():
    init_db()
    client = app.test_client()
    
    # 1. Register a test target
    target_email = "api_client_target@spectre.io"
    if not get_user_by_email(target_email):
        create_user(target_email, "Pass12345")
    
    # 2. Login as admin
    login_resp = client.post('/api/auth/login', json={
        'email': os.environ.get('ADMIN_EMAIL', 'admin@spectre.io'),
        'password': os.environ.get('ADMIN_PASSWORD', 'spectre_admin_2026')
    })
    assert login_resp.status_code == 200, f"Admin login failed: {login_resp.data}"
    
    # 3. Upgrade user via admin route
    up_resp = client.post('/api/admin/upgrade', json={
        'email': target_email,
        'tier': 'lifetime'
    })
    assert up_resp.status_code == 200, f"Admin upgrade failed: {up_resp.data}"
    up_data = json.loads(up_resp.data)
    assert up_data.get('success') is True
    assert up_data.get('tier') == 'lifetime'
    
    # 4. Verify user list
    users_resp = client.get('/api/admin/users')
    assert users_resp.status_code == 200
    users_data = json.loads(users_resp.data)
    assert 'users' in users_data
    emails = [u['email'] for u in users_data['users']]
    assert target_email in emails

def test_payment_checkout_flow():
    import uuid
    client = app.test_client()
    buyer_email = f"buyer_{uuid.uuid4().hex[:8]}@spectre.io"

    # 1. Initiate order creation (Step 1 -> Step 2)
    create_resp = client.post('/api/payment/create-order', json={
        'email': buyer_email,
        'plan_id': 'lifetime',
        'method': 'ltc'
    })
    assert create_resp.status_code == 200, f"Order creation failed: {create_resp.data}"
    order_data = json.loads(create_resp.data)
    assert order_data.get('success') is True
    order = order_data.get('order')
    assert order is not None
    order_id = order['id']
    assert order_id.startswith('SPEC-')
    assert order['status'] == 'pending'
    assert order['crypto_amount'] > 0
    assert 'LTC' in order_data['payment_instructions']['method'].upper()

    # 2. Strict Anti-Bypass Check: User must NOT be auto-upgraded simply by creating an order!
    user_before = get_user_by_email(buyer_email)
    assert (user_before is None) or (user_before['tier'] not in ('lifetime', 'premium', 'admin')), "Security violation: user was auto-upgraded without verified payment!"

    # 3. Submit Invalid TXID Proof (Must reject short/bogus strings)
    short_proof_resp = client.post('/api/payment/submit-proof', json={
        'order_id': order_id,
        'tx_hash': '12'
    })
    assert short_proof_resp.status_code == 400

    # 4. Submit Valid TXID Proof (Step 3 -> Step 4)
    valid_txid = "8f3b9c02e5a14d7e6f8b9a0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e"
    proof_resp = client.post('/api/payment/submit-proof', json={
        'order_id': order_id,
        'tx_hash': valid_txid,
        'notes': 'Test LTC transfer from Electrum'
    })
    assert proof_resp.status_code == 200
    p_data = json.loads(proof_resp.data)
    assert p_data['order']['status'] == 'verifying'
    assert p_data['order']['tx_hash'] == valid_txid

    # 5. Admin Login & Order Queue Approval
    client.post('/api/auth/login', json={
        'email': os.environ.get('ADMIN_EMAIL', 'admin@spectre.io'),
        'password': os.environ.get('ADMIN_PASSWORD', 'spectre_admin_2026')
    })

    # Verify order is in admin queue
    orders_resp = client.get('/api/admin/orders')
    assert orders_resp.status_code == 200
    orders_list = json.loads(orders_resp.data).get('orders', [])
    target_in_list = any(o['id'] == order_id for o in orders_list)
    assert target_in_list, f"Order {order_id} not visible in admin orders queue"

    # Admin approves order
    approve_resp = client.post(f'/api/admin/orders/{order_id}/approve', json={
        'notes': 'Verified on Blockchair'
    })
    assert approve_resp.status_code == 200
    appr_data = json.loads(approve_resp.data)
    assert appr_data['order']['status'] == 'approved'

    # 6. Verify buyer account is now elevated to lifetime!
    user_after = get_user_by_email(buyer_email)
    assert user_after is not None
    assert user_after['tier'] == 'lifetime', "User was not elevated after order approval!"

    # 7. Check order status endpoint
    status_resp = client.get(f'/api/payment/order-status/{order_id}')
    assert status_resp.status_code == 200
    s_data = json.loads(status_resp.data)
    assert s_data['approved'] is True
    assert s_data['redirect'] == '/app'

def test_order_rejection_flow():
    client = app.test_client()
    bogus_email = "fake_buyer_99@spectre.io"
    if get_user_by_email(bogus_email):
        update_user_tier(bogus_email, 'free')

    # 1. Create order
    create_resp = client.post('/api/payment/create-order', json={
        'email': bogus_email,
        'plan_id': 'lifetime',
        'method': 'btc'
    })
    assert create_resp.status_code == 200
    order_id = json.loads(create_resp.data)['order']['id']

    # 2. Submit fake hash
    proof_resp = client.post('/api/payment/submit-proof', json={
        'order_id': order_id,
        'tx_hash': '0000000000000fakehash12345'
    })
    assert proof_resp.status_code == 200

    # 3. Admin logs in and rejects order
    client.post('/api/auth/login', json={
        'email': os.environ.get('ADMIN_EMAIL', 'admin@spectre.io'),
        'password': os.environ.get('ADMIN_PASSWORD', 'spectre_admin_2026')
    })
    reject_resp = client.post(f'/api/admin/orders/{order_id}/reject', json={
        'reason': 'TXID does not exist on Bitcoin mempool'
    })
    assert reject_resp.status_code == 200
    r_data = json.loads(reject_resp.data)
    assert r_data['order']['status'] == 'rejected'

    # 4. Confirm user remains non-elevated
    user = get_user_by_email(bogus_email)
    assert user is None or user['tier'] not in ('lifetime', 'premium', 'admin')

    # 5. Order status check confirms rejected
    status_resp = client.get(f'/api/payment/order-status/{order_id}')
    assert status_resp.status_code == 200
    assert json.loads(status_resp.data)['order']['status'] == 'rejected'
    assert json.loads(status_resp.data)['approved'] is False

def test_payment_config_endpoint():
    client = app.test_client()
    cfg_resp = client.get('/api/payment/config')
    assert cfg_resp.status_code == 200
    cfg_data = json.loads(cfg_resp.data)
    assert 'LTC_ADDRESS' in cfg_data
    assert 'PAYPAL_EMAIL' in cfg_data
    assert 'BTC_ADDRESS' in cfg_data
    assert 'ETH_ADDRESS' in cfg_data
    assert 'CASHAPP_TAG' in cfg_data

def test_strict_paywall_blocks_free_users():
    client = app.test_client()
    # 1. Unauthenticated request to omni must return 403
    omni_resp = client.get('/api/omni?target=8.8.8.8')
    assert omni_resp.status_code == 403
    omni_data = json.loads(omni_resp.data)
    assert omni_data.get('upgrade_required') is True

    # 2. Free user request to omni must also return 403
    free_email = "strictly_free_user@spectre.io"
    if not get_user_by_email(free_email):
        create_user(free_email, "FreePass12345", tier='free')
    client.post('/api/auth/login', json={'email': free_email, 'password': "FreePass12345"})
    
    omni_resp_free = client.get('/api/omni?target=8.8.8.8')
    assert omni_resp_free.status_code == 403

def test_landing_page_routes():
    client = app.test_client()
    # Guest visiting / gets landing page
    landing_resp = client.get('/')
    assert landing_resp.status_code == 200
    assert b'CONFIDENTIAL // OPERATOR ACCESS ONLY' in landing_resp.data or b'RESTRICTED OPERATOR' in landing_resp.data

    # Explicit /landing route
    explicit_landing = client.get('/landing')
    assert explicit_landing.status_code == 200

def test_dedicated_checkout_page_route():
    client = app.test_client()
    # Check default lifetime plan
    chk_resp = client.get('/checkout')
    assert chk_resp.status_code == 200
    assert b'CUSTODIAL VAULT' in chk_resp.data or b'CHECKOUT' in chk_resp.data
    assert b'Lifetime Master Pass' in chk_resp.data or b'SPECTRE' in chk_resp.data

    # Check premium plan query
    chk_prem = client.get('/checkout?plan=premium')
    assert chk_prem.status_code == 200
    assert b'Pro Tactical' in chk_prem.data or b'19' in chk_prem.data

def test_auto_check_endpoint():
    client = app.test_client()
    create_resp = client.post('/api/payment/create-order', json={
        'email': 'autocheck_tester@spectre.io',
        'plan_id': 'lifetime',
        'method': 'ltc'
    })
    assert create_resp.status_code == 200
    order_id = json.loads(create_resp.data)['order']['id']

    # Auto-check without TXID
    chk_resp = client.get(f'/api/payment/auto-check/{order_id}')
    assert chk_resp.status_code == 200
    c_data = json.loads(chk_resp.data)
    assert c_data['success'] is True
    assert 'order' in c_data

def test_logout_route_and_session_clearing():
    client = app.test_client()
    # 1. Login as admin
    client.post('/api/auth/login', json={
        'email': os.environ.get('ADMIN_EMAIL', 'admin@spectre.io'),
        'password': os.environ.get('ADMIN_PASSWORD', 'spectre_admin_2026')
    })
    # 2. Verify dashboard renders for admin
    dash_resp = client.get('/')
    assert dash_resp.status_code == 200
    assert b'TOPOLOGY' in dash_resp.data or b'SPECTRE' in dash_resp.data
    
    # 3. Hit /logout route directly
    logout_resp = client.get('/logout', follow_redirects=True)
    assert logout_resp.status_code == 200
    # 4. Now root renders landing page
    assert b'CONFIDENTIAL // OPERATOR ACCESS ONLY' in logout_resp.data or b'RESTRICTED OPERATOR' in logout_resp.data

def test_admin_settings_and_plans_api():
    client = app.test_client()
    # 1. Login as admin
    client.post('/api/auth/login', json={
        'email': os.environ.get('ADMIN_EMAIL', 'admin@spectre.io'),
        'password': os.environ.get('ADMIN_PASSWORD', 'spectre_admin_2026')
    })

    # 2. Get settings
    s_resp = client.get('/api/admin/settings')
    assert s_resp.status_code == 200
    s_data = json.loads(s_resp.data)
    assert 'LTC_ADDRESS' in s_data['settings']

    # 3. Update settings
    up_s_resp = client.post('/api/admin/settings', json={
        'LTC_ADDRESS': 'ltc1qcustomwallet777test',
        'PAYPAL_EMAIL': 'newmerchant@spectre.io'
    })
    assert up_s_resp.status_code == 200
    up_s_data = json.loads(up_s_resp.data)
    assert up_s_data['settings']['LTC_ADDRESS'] == 'ltc1qcustomwallet777test'
    assert up_s_data['settings']['PAYPAL_EMAIL'] == 'newmerchant@spectre.io'

    # 4. Public plans endpoint
    pub_plans = client.get('/api/public/plans')
    assert pub_plans.status_code == 200
    pub_data = json.loads(pub_plans.data)
    assert len(pub_data['plans']) >= 2

    # 5. Admin create custom plan
    new_plan_resp = client.post('/api/admin/plans', json={
        'id': 'test_enterprise',
        'name': 'Enterprise Tactical',
        'price': 299.0,
        'billing_period': 'one-time',
        'badge': 'ENTERPRISE',
        'description': 'Custom test plan',
        'features': ['Custom feature 1', 'Custom feature 2']
    })
    assert new_plan_resp.status_code == 200
    p_data = json.loads(new_plan_resp.data)
    assert p_data['plan']['id'] == 'test_enterprise'
    assert p_data['plan']['price'] == 299.0

    # 6. Admin delete plan
    del_resp = client.delete('/api/admin/plans/test_enterprise')
    assert del_resp.status_code == 200
