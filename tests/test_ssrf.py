"""
Security tests verifying SSRF protection across network-fetching modules.
"""
from modules.headers import is_safe_url, analyze_headers
from modules.ip_lookup import lookup_ip

def test_ssrf_blocked_urls():
    # Loopback
    assert is_safe_url("http://127.0.0.1") is False
    assert is_safe_url("http://localhost:5000") is False
    assert is_safe_url("http://127.0.0.1:8080/admin") is False
    
    # Private RFC1918
    assert is_safe_url("http://192.168.1.1") is False
    assert is_safe_url("http://10.0.0.1") is False
    assert is_safe_url("http://172.16.0.1") is False
    
    # Cloud metadata
    assert is_safe_url("http://169.254.169.254/latest/meta-data/") is False

def test_headers_raises_on_ssrf():
    raised = False
    try:
        analyze_headers("http://127.0.0.1:8000")
    except ValueError as e:
        if "Blocked" in str(e):
            raised = True
    assert raised, "Expected ValueError('Blocked: ...') on internal IP"

def test_ip_lookup_blocks_private():
    for blocked_ip in ("127.0.0.1", "192.168.1.1", "10.200.1.5"):
        raised = False
        try:
            lookup_ip(blocked_ip)
        except ValueError as e:
            if "Blocked" in str(e):
                raised = True
        assert raised, f"Expected ValueError('Blocked: ...') on {blocked_ip}"
