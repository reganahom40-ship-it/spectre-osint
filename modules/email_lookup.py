import dns.resolver
import hashlib
import requests
import whois
import re

def lookup_email(email: str) -> dict:
    if not re.match(r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$', email):
        raise ValueError(f"Invalid email format: {email}")

    handle, domain = email.split('@')

    mx_records = []
    try:
        answers = dns.resolver.resolve(domain, 'MX')
        for rdata in answers:
            mx_records.append({
                'priority': rdata.preference,
                'server': str(rdata.exchange).rstrip('.')
            })
        mx_records.sort(key=lambda x: x['priority'])
    except Exception:
        pass

    spf_record = None
    try:
        answers = dns.resolver.resolve(domain, 'TXT')
        for rdata in answers:
            txt = "".join([x.decode('utf-8') for x in rdata.strings])
            if txt.startswith('v=spf1'):
                spf_record = txt
                break
    except Exception:
        pass

    dmarc_record = None
    try:
        answers = dns.resolver.resolve(f'_dmarc.{domain}', 'TXT')
        for rdata in answers:
            txt = "".join([x.decode('utf-8') for x in rdata.strings])
            if txt.startswith('v=DMARC1'):
                dmarc_record = txt
                break
    except Exception:
        pass

    md5_hash = hashlib.md5(email.lower().strip().encode('utf-8')).hexdigest()
    gravatar_url = f"https://gravatar.com/avatar/{md5_hash}?d=404"
    gravatar_exists = False
    try:
        resp = requests.get(gravatar_url, timeout=5)
        if resp.status_code == 200:
            gravatar_exists = True
    except Exception:
        pass

    mail_provider = "Unknown"
    provider_map = {
        'google.com': 'Google Workspace',
        'googlemail.com': 'Google Workspace',
        'outlook.com': 'Microsoft 365',
        'hotmail.com': 'Microsoft 365',
        'protonmail.ch': 'ProtonMail',
        'zoho.com': 'Zoho Mail',
        'icloud.com': 'iCloud Mail',
        'apple.com': 'iCloud Mail',
        'yahoo.com': 'Yahoo Mail'
    }
    
    for mx in mx_records:
        server = mx['server'].lower()
        for key, val in provider_map.items():
            if key in server:
                mail_provider = val
                break
        if mail_provider != "Unknown":
            break

    domain_whois = None
    try:
        w = whois.whois(domain)
        domain_whois = {
            'registrar': w.registrar,
            'creation_date': str(w.creation_date[0] if isinstance(w.creation_date, list) else w.creation_date) if hasattr(w, 'creation_date') and w.creation_date else None,
            'expiration_date': str(w.expiration_date[0] if isinstance(w.expiration_date, list) else w.expiration_date) if hasattr(w, 'expiration_date') and w.expiration_date else None,
        }
    except Exception:
        pass

    return {
        'email': email,
        'handle': handle,
        'domain': domain,
        'valid_format': True,
        'mx_records': mx_records,
        'spf_record': spf_record,
        'dmarc_record': dmarc_record,
        'mail_provider': mail_provider,
        'gravatar': {
            'exists': gravatar_exists,
            'url': gravatar_url if gravatar_exists else None
        },
        'domain_whois': domain_whois
    }
