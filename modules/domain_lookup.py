import whois
import dns.resolver
import ssl
import socket
import requests
import re
import json

def lookup_domain(domain: str) -> dict:
    if not re.match(r'^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$', domain):
        raise ValueError(f"Invalid domain format: {domain}")

    domain_whois = None
    try:
        w = whois.whois(domain)
        domain_whois = {
            'registrar': w.registrar,
            'creation_date': str(w.creation_date[0] if isinstance(w.creation_date, list) else w.creation_date) if hasattr(w, 'creation_date') and w.creation_date else None,
            'expiration_date': str(w.expiration_date[0] if isinstance(w.expiration_date, list) else w.expiration_date) if hasattr(w, 'expiration_date') and w.expiration_date else None,
            'name_servers': getattr(w, 'name_servers', None),
            'registrant': getattr(w, 'name', None),
            'status': getattr(w, 'status', None),
            'emails': getattr(w, 'emails', None)
        }
    except Exception:
        pass

    dns_records = {'A': [], 'AAAA': [], 'MX': [], 'NS': [], 'TXT': [], 'CNAME': [], 'SOA': []}
    for rec_type in dns_records.keys():
        try:
            answers = dns.resolver.resolve(domain, rec_type)
            for rdata in answers:
                if rec_type == 'TXT':
                    dns_records[rec_type].append("".join([x.decode('utf-8') for x in rdata.strings]))
                elif rec_type == 'MX':
                    dns_records[rec_type].append(f"{rdata.preference} {str(rdata.exchange).rstrip('.')}")
                elif rec_type == 'SOA':
                    dns_records[rec_type].append(f"{rdata.mname} {rdata.rname} {rdata.serial}")
                else:
                    dns_records[rec_type].append(str(rdata))
        except Exception:
            pass

    ssl_info = None
    try:
        context = ssl.create_default_context()
        with socket.create_connection((domain, 443), timeout=5) as sock:
            with context.wrap_socket(sock, server_hostname=domain) as ssock:
                cert = ssock.getpeercert()
                ssl_info = {
                    'issuer': dict(x[0] for x in cert.get('issuer', [])),
                    'subject': dict(x[0] for x in cert.get('subject', [])),
                    'serial_number': cert.get('serialNumber'),
                    'notBefore': cert.get('notBefore'),
                    'notAfter': cert.get('notAfter'),
                    'subjectAltName': cert.get('subjectAltName')
                }
    except Exception:
        pass

    subdomains = []
    try:
        resp = requests.get(f"https://crt.sh/?q=%25.{domain}&output=json", timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            names = set()
            for entry in data:
                nv = entry.get('name_value', '')
                for n in nv.split('\n'):
                    n = n.strip().lower()
                    if n.endswith(domain) and n != domain and not n.startswith('*'):
                        names.add(n)
            subdomains = sorted(list(names))[:100]
    except Exception:
        pass

    robots_txt = None
    try:
        resp = requests.get(f"http://{domain}/robots.txt", timeout=5)
        if resp.status_code == 200:
            robots_txt = resp.text
    except Exception:
        pass

    sitemap = None
    try:
        resp = requests.get(f"http://{domain}/sitemap.xml", timeout=5)
        if resp.status_code == 200:
            sitemap = resp.text[:500]
    except Exception:
        pass

    return {
        'domain': domain,
        'whois': domain_whois,
        'dns': dns_records,
        'ssl': ssl_info,
        'subdomains': subdomains,
        'robots_txt': robots_txt,
        'sitemap': sitemap
    }
