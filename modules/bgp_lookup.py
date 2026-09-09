import requests
import re

def lookup_bgp(asn_or_ip: str) -> dict:
    query = str(asn_or_ip).strip()
    if not query:
        raise ValueError("ASN or IP query cannot be empty.")

    # Clean ASN format (e.g. AS15169 -> 15169)
    asn_clean = query.upper().replace("AS", "") if query.upper().startswith("AS") else query

    # Query RIPE Stat public API
    ripe_overview_url = f"https://stat.ripe.net/data/as-overview/data.json?resource=AS{asn_clean}"
    ripe_prefixes_url = f"https://stat.ripe.net/data/announced-prefixes/data.json?resource=AS{asn_clean}"
    
    asn_name = "Unknown Network"
    asn_holder = "Unknown Holder"
    announced_v4 = 0
    announced_v6 = 0
    sample_prefixes = []

    try:
        resp = requests.get(ripe_overview_url, timeout=5)
        if resp.status_code == 200:
            data = resp.json().get('data', {})
            asn_holder = data.get('holder', 'Unknown')
            asn_name = data.get('resource', f'AS{asn_clean}')
    except Exception:
        pass

    try:
        resp_pfx = requests.get(ripe_prefixes_url, timeout=5)
        if resp_pfx.status_code == 200:
            pfx_data = resp_pfx.json().get('data', {}).get('prefixes', [])
            sample_prefixes = [p.get('prefix') for p in pfx_data[:15] if p.get('prefix')]
            announced_v4 = sum(1 for p in pfx_data if ':' not in p.get('prefix', ''))
            announced_v6 = sum(1 for p in pfx_data if ':' in p.get('prefix', ''))
    except Exception:
        pass

    return {
        "query": query,
        "asn": f"AS{asn_clean}",
        "holder": asn_holder,
        "resource": asn_name,
        "prefixes_v4_count": announced_v4,
        "prefixes_v6_count": announced_v6,
        "total_announced_prefixes": announced_v4 + announced_v6,
        "sample_prefixes": sample_prefixes,
        "looking_glass_url": f"https://bgp.he.net/AS{asn_clean}"
    }
