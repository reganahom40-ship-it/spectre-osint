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
        'method': 'card',
        'amount': 99
    })
    assert pay_resp.status_code == 200, f"Checkout failed: {pay_resp.data}"
    pay_data = json.loads(pay_resp.data)
    assert pay_data.get('success') is True
    assert pay_data.get('tier') == 'lifetime'
