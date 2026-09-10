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
            timeout=(1.0, 1.5),
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


def check_username(username: str, fast_mode: bool = True) -> dict:
    results = []
    found_count = 0
    not_found_count = 0
    errors_count = 0

    platforms_to_check = config.PLATFORMS[:45] if fast_mode else config.PLATFORMS

    # 45 parallel threads = checked in ~1 second
    with concurrent.futures.ThreadPoolExecutor(max_workers=45) as executor:
        future_to_platform = {
            executor.submit(check_single_platform, platform, username): platform
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
                else:
                    errors_count += 1
            except Exception:
                errors_count += 1

    sort_order = {'found': 0, 'not_found': 1, 'error': 2}
    results.sort(key=lambda x: (sort_order.get(x['status'], 3), x['platform']))

    return {
        'username': username,
        'total_checked': len(platforms_to_check),
        'total_platforms': len(config.PLATFORMS),
        'found_count': found_count,
        'not_found_count': not_found_count,
        'errors_count': errors_count,
        'found': [r for r in results if r['status'] == 'found'],
        'not_found': [r for r in results if r['status'] == 'not_found'],
        'errors': [r for r in results if r['status'] == 'error'],
        'results': results
    }
