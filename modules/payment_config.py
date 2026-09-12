"""
SPECTRE Payment & Settlement Configuration.

Supports dynamic configuration stored in SQLite (via Admin Panel),
environment variables (Render Dashboard), or defaults.
"""
import os

DEFAULT_PAYMENT_CONFIG = {
    'LTC_ADDRESS': os.environ.get('LTC_ADDRESS', 'ltc1q4m9vzp0wx88m3q25974c4q5ek6l859e2y7mrh6u8'),
    'BTC_ADDRESS': os.environ.get('BTC_ADDRESS', 'bc1q9vzp0wx88m3q25974c4q5ek6l859e2y7mrh6u8'),
    'ETH_ADDRESS': os.environ.get('ETH_ADDRESS', '0x71C7656EC7ab88b098defB751B7401B5f6d8976F'),
    'PAYPAL_EMAIL': os.environ.get('PAYPAL_EMAIL', 'payments@spectre.io'),
    'PAYPAL_LINK': os.environ.get('PAYPAL_LINK', 'https://paypal.me/SpectreIntel'),
    'CASHAPP_TAG': os.environ.get('CASHAPP_TAG', '$SpectreIntel'),
    'PRICE_PRO_MONTHLY': 19.00,
    'PRICE_LIFETIME': 99.00
}

def get_payment_config():
    """Returns current active payment routing addresses and merchant tags merged from DB & Env."""
    config = dict(DEFAULT_PAYMENT_CONFIG)
    try:
        from modules.db import get_all_settings, get_plan
        db_settings = get_all_settings()
        for k, v in db_settings.items():
            if v:
                config[k] = v

        pro_plan = get_plan('premium')
        if pro_plan:
            config['PRICE_PRO_MONTHLY'] = float(pro_plan['price'])
        lifetime_plan = get_plan('lifetime')
        if lifetime_plan:
            config['PRICE_LIFETIME'] = float(lifetime_plan['price'])
    except Exception:
        pass
    return config
