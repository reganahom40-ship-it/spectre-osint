import requests
import ssl
import socket
import ipaddress
from urllib.parse import urlparse

def is_safe_url(url: str) -> bool:
    parsed = urlparse(url)
    hostname = parsed.hostname
    if not hostname:
        return False
    try:
        addr_info = socket.getaddrinfo(hostname, None)
        for _, _, _, _, sockaddr in addr_info:
            ip = sockaddr[0]
            ip_obj = ipaddress.ip_address(ip)
            if ip_obj.is_private or ip_obj.is_loopback or ip_obj.is_reserved or ip_obj.is_link_local or ip_obj.is_multicast:
                return False
    except Exception:
        return False
    return True

def analyze_headers(url: str) -> dict:
    if not url.startswith('http://') and not url.startswith('https://'):
        url = 'https://' + url
        
    if not is_safe_url(url):
        raise ValueError('Blocked: target resolves to internal/reserved IP address')

    try:
        with requests.get(url, allow_redirects=True, timeout=10, stream=True) as response:
            final_url = response.url
            status_code = response.status_code
            headers = dict(response.headers)
            
            redirect_chain = []
            for r in response.history:
                redirect_chain.append({
                    'status_code': r.status_code,
                    'url': r.url
                })
            
            cookies = []
            for c in response.cookies:
                cookies.append({
                    'name': c.name,
                    'domain': c.domain,
                    'path': c.path,
                    'secure': c.secure,
                    'httponly': c.has_nonstandard_attr('httponly') or c.has_nonstandard_attr('HttpOnly'),
                    'samesite': c._rest.get('samesite') or c._rest.get('SameSite')
                })
    except Exception as e:
        raise RuntimeError(f"Failed to fetch {url}: {str(e)}")

    sec_headers_to_check = [
        'Strict-Transport-Security',
        'Content-Security-Policy',
        'X-Content-Type-Options',
        'X-Frame-Options',
        'X-XSS-Protection',
        'Referrer-Policy',
        'Permissions-Policy',
        'Cross-Origin-Opener-Policy',
        'Cross-Origin-Resource-Policy'
    ]
    
    security_audit = []
    for h in sec_headers_to_check:
        present = False
        val = None
        for key in headers:
            if key.lower() == h.lower():
                present = True
                val = headers[key]
                break
        security_audit.append({
            'header': h,
            'present': present,
            'value': val
        })

    server = None
    powered_by = None
    for key in headers:
        if key.lower() == 'server':
            server = headers[key]
        elif key.lower() == 'x-powered-by':
            powered_by = headers[key]

    ssl_info = None
    parsed = urlparse(final_url)
    if parsed.scheme == 'https':
        try:
            domain = parsed.hostname
            context = ssl.create_default_context()
            with socket.create_connection((domain, 443), timeout=5) as sock:
                with context.wrap_socket(sock, server_hostname=domain) as ssock:
                    cert = ssock.getpeercert()
                    ssl_info = {
                        'issuer': dict(x[0] for x in cert.get('issuer', [])),
                        'subject': dict(x[0] for x in cert.get('subject', [])),
                        'expiry': cert.get('notAfter'),
                        'protocol_version': ssock.version()
                    }
        except Exception:
            pass

    return {
        'url': final_url,
        'status_code': status_code,
        'headers': headers,
        'redirect_chain': redirect_chain,
        'security_audit': security_audit,
        'server': server,
        'powered_by': powered_by,
        'cookies': cookies,
        'ssl': ssl_info
    }
