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
    client = app.test_client()
    pay_resp = client.post('/api/payment/checkout', json={
        'tier': 'lifetime',
        'method': 'ltc',
        'amount': 99
    })
    assert pay_resp.status_code == 200, f"Checkout failed: {pay_resp.data}"
    pay_data = json.loads(pay_resp.data)
    assert pay_data.get('success') is True
    assert pay_data.get('tier') == 'lifetime'

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
