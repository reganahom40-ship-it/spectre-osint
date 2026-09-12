import unittest
from unittest.mock import patch, MagicMock
from modules.vault import (
    generate_custodial_wallet,
    decrypt_private_key,
    get_vault_summary,
    execute_cold_withdrawal,
    validate_destination_address
)
from modules.db import (
    save_vault_wallet,
    get_vault_wallet_by_address,
    credit_vault_wallet,
    get_vault_totals,
    create_order,
    create_user,
    get_user_by_id,
    set_setting
)
from modules.crypto_verifier import verify_order_on_chain
from modules.payment_verifier import verify_paypal_order, verify_cashapp_payment, sync_pending_payments
import app as flask_app


def test_vault_key_generation_and_encryption():
    for coin in ['LTC', 'BTC', 'ETH']:
        wallet = generate_custodial_wallet(coin)
        assert wallet['currency'] == coin
        assert wallet['address'] is not None and len(wallet['address']) > 10
        assert wallet['encrypted_privkey'] is not None

        if coin == 'LTC':
            assert wallet['address'].startswith(('L', 'M'))
        elif coin == 'BTC':
            assert wallet['address'].startswith(('1', '3'))
        elif coin == 'ETH':
            assert wallet['address'].startswith('0x')

        raw_key = decrypt_private_key(wallet['encrypted_privkey'])
        assert len(raw_key) == 64


def test_vault_cold_withdrawal():
    wallet = generate_custodial_wallet('LTC')
    save_vault_wallet(
        currency='LTC',
        address=wallet['address'],
        encrypted_privkey=wallet['encrypted_privkey'],
        order_id='TEST-ORD-SWEEP-01',
        balance=0.0
    )
    credit_vault_wallet(wallet['address'], 5.0)

    assert validate_destination_address('LTC', 'LUWP8mP1795oE4wF4jHkyoQ9zzXhM96n9') is True
    assert validate_destination_address('LTC', 'invalid_address') is False
    assert validate_destination_address('ETH', '0x1111111111111111111111111111111111111111') is True

    try:
        execute_cold_withdrawal('admin@spectre.io', 'LTC', 'LUWP8mP1795oE4wF4jKhyoQ9zzXhM96n9', 999999.0)
        assert False, 'Should have raised ValueError on overdraft'
    except ValueError as e:
        assert 'Insufficient' in str(e)

    sweep = execute_cold_withdrawal('admin@spectre.io', 'LTC', 'LUWP8mP1795oE4wF4jKhyoQ9zzXhM96n9', 1.5)
    assert sweep['success'] is True
    assert sweep['tx_hash'].startswith('SWEEP-LTC-')
    assert sweep['amount'] == 1.5


def test_on_chain_verifier_auto_approval():
    import uuid
    email = f"chain_{uuid.uuid4().hex[:6]}@spectre.io"
    user = create_user(email, 'password123')
    order = create_order(email, 'tier_lifetime', 149.0, 'ltc', crypto_amount=1.5, deposit_address='LUWP8mP1795oE4wF4jKhyoQ9zzXhM96n9')

    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = {
        'data': {
            order['deposit_address']: {
                'address': {
                    'balance': 150000000,
                    'received': 150000000
                },
                'transactions': ['TX_ONCHAIN_TEST_CONFIRMED']
            }
        }
    }

    with patch('requests.get', return_value=mock_resp):
        res = verify_order_on_chain(order['id'])
        assert res['verified'] is True
        assert res['status'] == 'approved'

    updated_user = get_user_by_id(user['id'])
    assert updated_user['tier'] == 'lifetime'


def test_paypal_and_cashapp_verification():
    import uuid
    email = f"fiat_{uuid.uuid4().hex[:6]}@spectre.io"
    user = create_user(email, 'password123')

    pp_order = create_order(email, 'tier_monthly', 29.0, 'paypal')
    set_setting('PAYPAL_CLIENT_ID', 'test_client_id')
    set_setting('PAYPAL_CLIENT_SECRET', 'test_client_secret')

    mock_auth_resp = MagicMock()
    mock_auth_resp.status_code = 200
    mock_auth_resp.json.return_value = {'access_token': 'mock_token'}

    mock_order_resp = MagicMock()
    mock_order_resp.status_code = 200
    mock_order_resp.json.return_value = {
        'status': 'COMPLETED',
        'purchase_units': [{'amount': {'value': '29.00', 'currency_code': 'USD'}}]
    }

    with patch('requests.post', return_value=mock_auth_resp):
        with patch('requests.get', return_value=mock_order_resp):
            pay_res = verify_paypal_order(pp_order['id'], 'PAYID-MOCK-12345')
            assert pay_res['verified'] is True
            assert pay_res['status'] == 'approved'

    ca_order = create_order(email, 'tier_yearly', 79.0, 'cashapp')
    set_setting('CASHAPP_VERIFY_MODE', 'auto_note')
    cash_res = verify_cashapp_payment(ca_order['id'], f'Settlement for order {ca_order["id"]} from cashtag')
    assert cash_res['verified'] is True
    assert cash_res['status'] == 'approved'


def test_admin_vault_api_endpoints():
    client = flask_app.app.test_client()

    login_res = client.post('/api/auth/login', json={
        'email': 'admin@spectre.io',
        'password': 'spectre_admin_2026'
    })
    assert login_res.status_code == 200

    sum_res = client.get('/api/admin/vault/summary')
    assert sum_res.status_code == 200
    data = sum_res.get_json()
    assert data['success'] is True
    assert 'vault' in data
    assert 'totals' in data['vault']
    assert 'total_fiat_usd' in data['vault']

    sync_res = client.post('/api/admin/payments/sync')
    assert sync_res.status_code == 200
    sync_data = sync_res.get_json()
    assert sync_data['success'] is True
    assert 'sync' in sync_data

    bad_withdraw = client.post('/api/admin/vault/withdraw', json={
        'currency': 'LTC',
        'address': 'invalid_address',
        'amount': 500
    })
    assert bad_withdraw.status_code == 400
