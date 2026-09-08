import concurrent.futures
import requests
import random
import config

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


def check_single_platform(platform, username):
    url = platform['url'].format(username=username)
    headers = {'User-Agent': random.choice(config.USER_AGENTS)}
    status = 'not_found'
    http_code = None

    try:
        response = _session.get(
            url,
            headers=headers,
            timeout=config.REQUEST_TIMEOUT,
            allow_redirects=True,
            stream=True
        )
        http_code = response.status_code

        if http_code == 200:
            if platform.get('error_type') == 'message':
                text = response.text[:2000]
                if "No such user" in text or "User not found" in text or "does not exist" in text:
                    status = 'not_found'
                else:
                    status = 'found'
            else:
                status = 'found'
        elif http_code == 404:
            status = 'not_found'
        elif http_code in (301, 302, 303, 307, 308):
            status = 'not_found'
        elif http_code == 429:
            status = 'error'
        else:
            status = 'not_found'

        response.close()

    except requests.Timeout:
        status = 'error'
        http_code = None
    except (requests.ConnectionError, requests.RequestException):
        status = 'error'
        http_code = None
    except Exception:
        status = 'error'
        http_code = None

    return {
        'platform': platform['name'],
        'category': platform.get('category', 'Other'),
        'url': url,
        'status': status,
        'http_code': http_code
    }


def check_username(username: str) -> dict:
    results = []
    found_count = 0
    not_found_count = 0
    errors_count = 0

    # 50 parallel threads = 100+ platforms checked in ~2 seconds
    with concurrent.futures.ThreadPoolExecutor(max_workers=50) as executor:
        future_to_platform = {
            executor.submit(check_single_platform, platform, username): platform
            for platform in config.PLATFORMS
        }

        for future in concurrent.futures.as_completed(future_to_platform):
            res = future.result()
            results.append(res)
            if res['status'] == 'found':
                found_count += 1
            elif res['status'] == 'not_found':
                not_found_count += 1
            else:
                errors_count += 1

    sort_order = {'found': 0, 'not_found': 1, 'error': 2}
    results.sort(key=lambda x: (sort_order.get(x['status'], 3), x['platform']))

    return {
        'username': username,
        'total_platforms': len(config.PLATFORMS),
        'found': found_count,
        'not_found': not_found_count,
        'errors': errors_count,
        'results': results
    }
