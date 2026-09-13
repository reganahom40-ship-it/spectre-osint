"""
Hardened HTTP Header & Security Configuration Analyzer for SPECTRE.
Features multi-layer SSRF validation across all redirect hops, cloud metadata blocking,
IPv4-mapped IPv6 mitigation, and TLS certificate inspection.
"""
import ssl
import socket
import ipaddress
import logging
from urllib.parse import urlparse, urljoin
import requests

logger = logging.getLogger(__name__)

# Cloud metadata and internal hostnames
BLOCKED_HOSTNAMES = {
    'localhost',
    'metadata.google.internal',
    '169.254.169.254',
    'instance-data',
    'metadata',
    'vault',
    'consul'
}

BLOCKED_NETWORKS = [
    ipaddress.ip_network('127.0.0.0/8'),        # Loopback
    ipaddress.ip_network('10.0.0.0/8'),         # Private class A
    ipaddress.ip_network('172.16.0.0/12'),      # Private class B
    ipaddress.ip_network('192.168.0.0/16'),     # Private class C
    ipaddress.ip_network('169.254.0.0/16'),     # Link-local / Cloud metadata
    ipaddress.ip_network('224.0.0.0/4'),        # Multicast
    ipaddress.ip_network('240.0.0.0/4'),        # Reserved
    ipaddress.ip_network('0.0.0.0/8'),          # Current network
    ipaddress.ip_network('::1/128'),            # IPv6 loopback
    ipaddress.ip_network('fc00::/7'),           # IPv6 unique local
    ipaddress.ip_network('fe80::/10'),          # IPv6 link-local
    ipaddress.ip_network('ff00::/8'),           # IPv6 multicast
    ipaddress.ip_network('::ffff:0:0/96'),      # IPv4-mapped IPv6 prefix
]


def is_safe_ip(ip_str: str) -> bool:
    """Verifies that an IP string does not belong to any restricted or private network."""
    try:
        ip_obj = ipaddress.ip_address(ip_str)
        if isinstance(ip_obj, ipaddress.IPv6Address) and ip_obj.ipv4_mapped:
            ip_obj = ip_obj.ipv4_mapped

        if ip_obj.is_private or ip_obj.is_loopback or ip_obj.is_reserved or ip_obj.is_link_local or ip_obj.is_multicast or ip_obj.is_unspecified:
            return False

        for blocked_net in BLOCKED_NETWORKS:
            if ip_obj in blocked_net:
                return False
        return True
    except Exception:
        return False


def is_safe_url(url: str) -> bool:
    """Validates URL scheme, hostname, and resolved IP addresses against SSRF attacks."""
    parsed = urlparse(url)
    if parsed.scheme not in ('http', 'https'):
        return False

    hostname = (parsed.hostname or '').strip().lower()
    if not hostname:
        return False

    if hostname in BLOCKED_HOSTNAMES or hostname.endswith('.internal') or hostname.endswith('.local'):
        return False

    # Check if hostname is directly an IP literal
    try:
        ip_obj = ipaddress.ip_address(hostname)
        return is_safe_ip(str(ip_obj))
    except ValueError:
        pass

    # Resolve hostname to all candidate IP addresses and verify each
    try:
        addr_info = socket.getaddrinfo(hostname, parsed.port or (443 if parsed.scheme == 'https' else 80), socket.AF_UNSPEC, socket.SOCK_STREAM)
        if not addr_info:
            return False
        for _, _, _, _, sockaddr in addr_info:
            ip_str = sockaddr[0]
            if not is_safe_ip(ip_str):
                return False
    except Exception as e:
        logger.debug(f"DNS resolution failed for SSRF check on {hostname}: {e}")
        return False

    return True


def analyze_headers(url: str, max_redirects: int = 3, timeout_seconds: int = 6) -> dict:
    """
    Performs security header analysis with manual hop-by-hop SSRF validation across all redirects.
    """
    if not url.startswith('http://') and not url.startswith('https://'):
        url = 'https://' + url

    current_url = url
    redirect_chain = []
    response = None
    session = requests.Session()
    session.headers.update({
        'User-Agent': 'SPECTRE-Threat-Auditor/8.6 (+https://spectre.io)'
    })

    try:
        for hop in range(max_redirects + 1):
            if not is_safe_url(current_url):
                raise ValueError(f"Blocked: Target or redirect destination resolves to an internal/reserved address ({current_url})")

            resp = session.get(
                current_url,
                allow_redirects=False,
                timeout=(3.0, timeout_seconds),
                stream=True,
                verify=True
            )

            if resp.is_redirect or resp.status_code in (301, 302, 303, 307, 308):
                location = resp.headers.get('Location', '')
                redirect_chain.append({
                    'status_code': resp.status_code,
                    'url': current_url,
                    'location': location
                })
                if not location:
                    response = resp
                    break
                next_url = urljoin(current_url, location)
                current_url = next_url
                resp.close()
            else:
                response = resp
                break

        if response is None:
            raise RuntimeError(f"Exceeded maximum redirects ({max_redirects})")

        final_url = current_url
        status_code = response.status_code
        headers = dict(response.headers)

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

        response.close()

    except requests.exceptions.SSLError as e:
        raise ValueError(f"TLS/SSL negotiation failed: {str(e)}")
    except requests.exceptions.Timeout:
        raise TimeoutError(f"Connection timed out while probing {url}")
    except ValueError:
        raise
    except Exception as e:
        raise RuntimeError(f"Failed to probe {url}: {str(e)}")

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
    if parsed.scheme == 'https' and parsed.hostname and is_safe_url(final_url):
        try:
            domain = parsed.hostname
            context = ssl.create_default_context()
            with socket.create_connection((domain, parsed.port or 443), timeout=3) as sock:
                with context.wrap_socket(sock, server_hostname=domain) as ssock:
                    cert = ssock.getpeercert()
                    if cert:
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
