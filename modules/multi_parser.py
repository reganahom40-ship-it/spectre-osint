"""
Multi-Entity Text Extraction & Parsing Engine for SPECTRE.
Extracts multiple distinct OSINT indicators (emails, domains, IPv4, IPv6, URLs,
cryptographic hashes, phone numbers, ASNs, handles) from raw unstructured text blocks.
"""
import re
import ipaddress
from urllib.parse import urlparse
from typing import Dict, Any, List


class MultiInputParser:
    """Parses arbitrary text inputs and extracts classified OSINT indicators."""

    # Regex patterns
    EMAIL_REGEX = re.compile(r'[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+')
    IPV4_REGEX = re.compile(r'\b(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\b')
    IPV6_REGEX = re.compile(r'\b(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}\b')
    URL_REGEX = re.compile(r'https?://(?:[-\w.]|(?:%[\da-fA-F]{2}))+[\w/\-?=%&.#~]*')
    DOMAIN_REGEX = re.compile(r'\b(?:[a-zA-Z0-9](?:[a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,24}\b')
    PHONE_REGEX = re.compile(r'(?:\+\d{1,3}[-.\s]?)?\(?\d{2,4}\)?[-.\s]?\d{3,4}[-.\s]?\d{3,9}')
    HASH_MD5_REGEX = re.compile(r'\b[a-fA-F0-9]{32}\b')
    HASH_SHA1_REGEX = re.compile(r'\b[a-fA-F0-9]{40}\b')
    HASH_SHA256_REGEX = re.compile(r'\b[a-fA-F0-9]{64}\b')
    ASN_REGEX = re.compile(r'\bAS\d+\b', re.IGNORECASE)
    DISCORD_ID_REGEX = re.compile(r'\b\d{17,20}\b')
    HANDLE_REGEX = re.compile(r'@[a-zA-Z0-9_]{3,30}')

    COMMON_TLDS = {
        'com', 'org', 'net', 'io', 'ai', 'co', 'app', 'dev', 'uk', 'ca', 'de', 'fr',
        'ru', 'info', 'biz', 'me', 'tv', 'xyz', 'online', 'site', 'tech', 'cloud', 'gov', 'edu'
    }

    @classmethod
    def parse_text(cls, text: str) -> Dict[str, Any]:
        """Extracts and deduplicates all classified entities from the provided text."""
        if not text:
            return {'entities': [], 'counts': {}, 'total_entities': 0}

        entities = []
        seen = set()

        def add_entity(val: str, etype: str, confidence: str = 'CONFIRMED'):
            val = val.strip().rstrip('.,;:()[]{}')
            if not val:
                return
            key = (etype, val.lower())
            if key in seen:
                return
            seen.add(key)
            entities.append({
                'value': val,
                'type': etype,
                'confidence': confidence
            })

        # 1. URLs
        for m in cls.URL_REGEX.finditer(text):
            url = m.group(0)
            add_entity(url, 'URL', 'CONFIRMED')
            # Extract domain from URL
            try:
                p = urlparse(url)
                if p.hostname:
                    add_entity(p.hostname, 'DOMAIN', 'CONFIRMED')
            except Exception:
                pass

        # 2. Emails
        for m in cls.EMAIL_REGEX.finditer(text):
            email = m.group(0)
            add_entity(email, 'EMAIL', 'CONFIRMED')
            if '@' in email:
                domain = email.split('@')[1]
                add_entity(domain, 'DOMAIN', 'HIGH')

        # 3. IPv4 Addresses
        for m in cls.IPV4_REGEX.finditer(text):
            ip = m.group(0)
            try:
                ip_obj = ipaddress.ip_address(ip)
                if not ip_obj.is_private and not ip_obj.is_loopback:
                    add_entity(ip, 'IP', 'CONFIRMED')
                else:
                    add_entity(ip, 'IP_INTERNAL', 'LOW')
            except ValueError:
                pass

        # 4. IPv6 Addresses
        for m in cls.IPV6_REGEX.finditer(text):
            ip = m.group(0)
            add_entity(ip, 'IPV6', 'CONFIRMED')

        # 5. ASNs
        for m in cls.ASN_REGEX.finditer(text):
            add_entity(m.group(0).upper(), 'ASN', 'CONFIRMED')

        # 6. Hashes
        for m in cls.HASH_SHA256_REGEX.finditer(text):
            add_entity(m.group(0).lower(), 'HASH_SHA256', 'CONFIRMED')
        for m in cls.HASH_SHA1_REGEX.finditer(text):
            add_entity(m.group(0).lower(), 'HASH_SHA1', 'CONFIRMED')
        for m in cls.HASH_MD5_REGEX.finditer(text):
            add_entity(m.group(0).lower(), 'HASH_MD5', 'CONFIRMED')

        # 7. Handles
        for m in cls.HANDLE_REGEX.finditer(text):
            add_entity(m.group(0).lstrip('@'), 'USERNAME', 'HIGH')

        # 8. Discord Snowflakes
        for m in cls.DISCORD_ID_REGEX.finditer(text):
            val = m.group(0)
            add_entity(val, 'DISCORD', 'HIGH')

        # 9. Domains (clean filter)
        for m in cls.DOMAIN_REGEX.finditer(text):
            dom = m.group(0).lower()
            tld = dom.split('.')[-1]
            if tld in cls.COMMON_TLDS and not any(e['value'] == dom for e in entities if e['type'] == 'DOMAIN'):
                add_entity(dom, 'DOMAIN', 'HIGH')

        # 10. Phone numbers
        for m in cls.PHONE_REGEX.finditer(text):
            raw_phone = m.group(0).strip()
            digits = re.sub(r'\D', '', raw_phone)
            if 7 <= len(digits) <= 15:
                add_entity(raw_phone, 'PHONE', 'MEDIUM')

        counts = {}
        for e in entities:
            t = e['type']
            counts[t] = counts.get(t, 0) + 1

        return {
            'entities': entities,
            'counts': counts,
            'total_entities': len(entities)
        }
