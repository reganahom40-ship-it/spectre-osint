"""
SPECTRE Payment & Settlement Configuration.

Edit this file or set environment variables in Render/production
to direct all incoming payments straight to your personal wallets and accounts.
"""
import os

PAYMENT_CONFIG = {
    # 1. Litecoin (LTC) - Instant, ultra-low fees
    'LTC_ADDRESS': os.environ.get('LTC_ADDRESS', 'ltc1q4m9vzp0wx88m3q25974c4q5ek6l859e2y7mrh6u8'),
    
    # 2. Bitcoin (BTC) - Native SegWit address
    'BTC_ADDRESS': os.environ.get('BTC_ADDRESS', 'bc1q9vzp0wx88m3q25974c4q5ek6l859e2y7mrh6u8'),
    
    # 3. Ethereum / USDT (ERC-20 / Arbitrum / Base)
    'ETH_ADDRESS': os.environ.get('ETH_ADDRESS', '0x71C7656EC7ab88b098defB751B7401B5f6d8976F'),
    
    # 4. PayPal - Your PayPal business email or paypal.me link
    'PAYPAL_EMAIL': os.environ.get('PAYPAL_EMAIL', 'payments@spectre.io'),
    'PAYPAL_LINK': os.environ.get('PAYPAL_LINK', 'https://paypal.me/SpectreIntel'),
    
    # 5. CashApp - Your $Cashtag
    'CASHAPP_TAG': os.environ.get('CASHAPP_TAG', '$SpectreIntel'),
    
    # 6. Pricing Plans (USD)
    'PRICE_PRO_MONTHLY': 19.00,
    'PRICE_LIFETIME': 99.00
}

def get_payment_config():
    """Returns current active payment routing addresses and merchant tags."""
    return PAYMENT_CONFIG
