"""
High-Speed Autonomous Username Discovery & Account Fingerprinting Engine for SPECTRE.
Supports FAST, BALANCED, and DEEP scan strategies with exact status code classification,
anti-bot detection (BLOCKED / RATE_LIMITED), and evidence provenance.
"""
import concurrent.futures
import requests
import random
import time
import config
from typing import Dict, Any, List

_session = requests.Session()
_session.headers.update({
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate',
    'Connection': 'keep-alive',
})
_adapter = requests.adapters.HTTPAdapter(
    pool_connections=120,
    pool_maxsize=120,
    max_retries=0
)
_session.mount('https://', _adapter)
_session.mount('http://', _adapter)


def check_single_platform(platform: dict, username: str, timeout: float = 2.5) -> dict:
    """Probes a single platform for user presence with accurate status classification."""
    url = platform['url'].format(username=username)
    user_agent = random.choice(config.USER_AGENTS)
    headers = {
        'User-Agent': user_agent,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
    }

    status = 'not_found'
    confidence = 'HIGH'
    http_code = None
    reason = ''
    evidence_snippet = None

    try:
        response = _session.get(
            url,
            headers=headers,
            timeout=(1.2, timeout),
            allow_redirects=True,
            stream=True
        )
        http_code = response.status_code

        # Read first 4KB of content for verification
        content_sample = response.raw.read(4096).decode('utf-8', errors='ignore') if response.raw else ''

        if http_code == 200:
            err_type = platform.get('error_type', 'status_code')
            if err_type == 'message':
                not_found_markers = [
                    "No such user", "User not found", "does not exist", "Profile Not Found",
                    "Page not found", "doesn't exist", "Cannot find user", "404 Not Found"
                ]
                if any(m.lower() in content_sample.lower() for m in not_found_markers):
                    status = 'not_found'
                    reason = 'Negative identity match (error message detected in page body)'
                else:
                    status = 'found'
                    confidence = 'CONFIRMED'
                    reason = 'Direct HTTP 200 profile presence confirmed'
            else:
                # Standard status code check
                # Verify we were not redirected to login page or generic home
                final_url = response.url.lower()
                if '/login' in final_url or '/signin' in final_url or final_url.rstrip('/') == 'https://' + platform['name'].lower() + '.com':
                    status = 'not_found'
                    reason = 'Redirected to authentication portal'
                else:
                    status = 'found'
                    confidence = 'CONFIRMED'
                    reason = 'Direct HTTP 200 profile presence confirmed'

            if status == 'found':
                evidence_snippet = f"HTTP 200 at {url}"

        elif http_code == 404:
            status = 'not_found'
            reason = 'HTTP 404 Resource Not Found'
        elif http_code == 429:
            status = 'rate_limited'
            confidence = 'UNVERIFIED'
            reason = 'HTTP 429 Rate Limited by upstream provider'
        elif http_code in (403, 401):
            status = 'blocked'
            confidence = 'UNVERIFIED'
            reason = f'HTTP {http_code} Anti-automation / Cloudflare challenge'
        elif http_code in (301, 302, 303, 307, 308):
            status = 'not_found'
            reason = f'HTTP {http_code} Redirection'
        elif http_code and http_code >= 500:
            status = 'error'
            confidence = 'UNVERIFIED'
            reason = f'HTTP {http_code} Upstream server error'
        else:
            status = 'unknown'
            reason = f'Unexpected HTTP status code {http_code}'

        response.close()

    except requests.exceptions.Timeout:
        status = 'timeout'
        confidence = 'UNVERIFIED'
        reason = 'Connection timed out'
    except (requests.exceptions.ConnectionError, requests.exceptions.RequestException) as e:
        status = 'error'
        confidence = 'UNVERIFIED'
        reason = f'Network connection failed ({type(e).__name__})'
    except Exception as e:
        status = 'error'
        confidence = 'UNVERIFIED'
        reason = str(e)

    return {
        'platform': platform['name'],
        'category': platform.get('category', 'Social'),
        'url': url,
        'status': status,
        'http_code': http_code,
        'confidence': confidence,
        'reason': reason,
        'evidence': evidence_snippet,
        'provenance': 'REAL_EXTERNAL_SOURCE',
        'timestamp': time.time()
    }


def check_username(username: str, mode: str = 'fast', fast_mode: bool = None) -> dict:
    """
    Executes parallel OSINT sweep for a target username.
    
    Scan strategies:
    - 'fast' (default): Top 30 highest-yield social and developer networks (~0.8s)
    - 'balanced': Top 60 social, dev, media, and gaming platforms (~1.5s)
    - 'deep': All 112+ configured worldwide platforms (~2.5s)
    """
    username = username.strip().lstrip('@')
    if not username:
        return {'username': '', 'found_count': 0, 'total_checked': 0, 'results': [], 'found': [], 'not_found': []}

    # Backward compatibility for boolean fast_mode arg
    if fast_mode is not None:
        mode = 'fast' if fast_mode else 'deep'

    mode = (mode or 'fast').lower()
    if mode == 'deep':
        platforms_to_check = config.PLATFORMS
        max_workers = min(60, len(platforms_to_check))
        timeout = 3.0
    elif mode == 'balanced':
        platforms_to_check = config.PLATFORMS[:60]
        max_workers = 45
        timeout = 2.2
    else: # fast
        platforms_to_check = config.PLATFORMS[:30]
        max_workers = 30
        timeout = 1.8

    results: List[dict] = []
    found_count = 0
    not_found_count = 0
    blocked_count = 0
    errors_count = 0

    with concurrent.futures.ThreadPoolExecutor(max_workers=max_workers) as executor:
        future_to_platform = {
            executor.submit(check_single_platform, platform, username, timeout): platform
            for platform in platforms_to_check
        }

        for future in concurrent.futures.as_completed(future_to_platform):
            try:
                res = future.result()
                results.append(res)
                if res['status'] == 'found':
                    found_count += 1
                elif res['status'] == 'not_found':
                    not_found_count += 1
                elif res['status'] in ('blocked', 'rate_limited'):
                    blocked_count += 1
                else:
                    errors_count += 1
            except Exception:
                errors_count += 1

    # Sort results: found first, then by platform name
    sort_priority = {'found': 0, 'blocked': 1, 'rate_limited': 2, 'not_found': 3, 'timeout': 4, 'error': 5, 'unknown': 6}
    results.sort(key=lambda x: (sort_priority.get(x['status'], 9), x['platform']))

    return {
        'username': username,
        'scan_mode': mode.upper(),
        'total_checked': len(platforms_to_check),
        'total_configured_platforms': len(config.PLATFORMS),
        'found_count': found_count,
        'not_found_count': not_found_count,
        'blocked_count': blocked_count,
        'errors_count': errors_count,
        'found': [r for r in results if r['status'] == 'found'],
        'not_found': [r for r in results if r['status'] == 'not_found'],
        'blocked': [r for r in results if r['status'] in ('blocked', 'rate_limited')],
        'errors': [r for r in results if r['status'] in ('error', 'timeout', 'unknown')],
        'results': results
    }
