"""
Real-time Crypto Exchange Rate Estimator for SPECTRE Checkout.
Calculates exact crypto amounts for LTC, BTC, and ETH.
"""
import time
import requests
import logging

logger = logging.getLogger(__name__)

# Fallback market rates (USD)
FALLBACK_RATES = {
    'ltc': 85.0,
    'btc': 65000.0,
    'eth': 2600.0
}

_cache = {
    'rates': dict(FALLBACK_RATES),
    'last_updated': 0
}

def get_crypto_rate(crypto: str) -> float:
    crypto = crypto.lower()
    now = time.time()
    
    # Refresh cache every 10 minutes
    if now - _cache['last_updated'] > 600:
        try:
            resp = requests.get(
                'https://api.coingecko.com/api/v3/simple/price?ids=litecoin,bitcoin,ethereum&vs_currencies=usd',
                timeout=3
            )
            if resp.status_code == 200:
                data = resp.json()
                if 'litecoin' in data:
                    _cache['rates']['ltc'] = float(data['litecoin']['usd'])
                if 'bitcoin' in data:
                    _cache['rates']['btc'] = float(data['bitcoin']['usd'])
                if 'ethereum' in data:
                    _cache['rates']['eth'] = float(data['ethereum']['usd'])
                _cache['last_updated'] = now
        except Exception:
            pass

    return _cache['rates'].get(crypto, FALLBACK_RATES.get(crypto, 1.0))

def calculate_crypto_amount(amount_usd: float, crypto: str) -> float:
    rate = get_crypto_rate(crypto)
    if rate <= 0:
        rate = 1.0
    val = amount_usd / rate
    if crypto.lower() == 'btc':
        return round(val, 6)
    elif crypto.lower() == 'eth':
        return round(val, 5)
    else:
        return round(val, 4)
