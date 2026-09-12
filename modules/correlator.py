"""
Cross-module intelligence correlator.
"""
import logging
from modules.models import Confidence, TargetType

logger = logging.getLogger(__name__)

class IntelligenceCorrelator:
    def correlate(self, target: str, target_type, dossier: dict) -> list[dict]:
        correlations = []
        
        if target_type == TargetType.EMAIL:
            correlations.extend(self._correlate_email(target, dossier))
        elif target_type == TargetType.DOMAIN:
            correlations.extend(self._correlate_domain(target, dossier))
        elif target_type == TargetType.IP:
            correlations.extend(self._correlate_ip(target, dossier))
        elif target_type == TargetType.USERNAME:
            correlations.extend(self._correlate_username(target, dossier))
        elif target_type == TargetType.PHONE:
            correlations.extend(self._correlate_phone(target, dossier))
        elif target_type == TargetType.DISCORD:
            correlations.extend(self._correlate_discord(target, dossier))
            
        return correlations

    def _correlate_email(self, target, dossier) -> list[dict]:
        findings = []
        email_data = dossier.get('email') or dossier.get('lookup_email', {})
        
        if 'domain' in email_data and email_data['domain']:
            findings.append({
                'type': 'email_domain_link',
                'title': 'Email Domain Intelligence',
                'description': f"Email domain {email_data['domain']} has been identified.",
                'confidence': 'HIGH',
                'evidence': [f"MX records: {len(email_data.get('mx_records', []))}"],
                'related_modules': ['email'],
                'suggested_targets': [email_data['domain']]
            })
            
        if '@' in target:
            username = target.split('@')[0]
            findings.append({
                'type': 'email_username_link',
                'title': 'Email Username',
                'description': f"Local part of email is {username}.",
                'confidence': 'HIGH',
                'evidence': ['Extracted from email address'],
                'related_modules': ['email'],
                'suggested_targets': [username]
            })
            
        if 'mail_provider' in email_data and email_data['mail_provider']:
            findings.append({
                'type': 'mail_provider',
                'title': 'Mail Provider Identified',
                'description': f"Provider is {email_data['mail_provider']}.",
                'confidence': 'HIGH',
                'evidence': [],
                'related_modules': ['email'],
                'suggested_targets': []
            })

        breach_data = dossier.get('breaches') or dossier.get('check_breaches', {})
        if breach_data and breach_data.get('total_breaches', 0) > 0:
            findings.append({
                'type': 'breach_exposure',
                'title': 'Known Breach Exposure',
                'description': f"Identified across {breach_data.get('total_breaches')} distinct data breaches.",
                'confidence': 'CONFIRMED',
                'evidence': [b.get('name') for b in breach_data.get('breaches', [])[:5]],
                'related_modules': ['breaches'],
                'suggested_targets': []
            })
            
        return findings

    def _correlate_domain(self, target, dossier) -> list[dict]:
        findings = []
        domain_data = dossier.get('domain') or dossier.get('lookup_domain', {})
        
        if 'dns' in domain_data and isinstance(domain_data['dns'], dict) and domain_data['dns'].get('A'):
            findings.append({
                'type': 'domain_ip_link',
                'title': 'DNS A Records',
                'description': f"Domain resolves to {len(domain_data['dns']['A'])} IP(s).",
                'confidence': 'HIGH',
                'evidence': domain_data['dns']['A'],
                'related_modules': ['domain'],
                'suggested_targets': domain_data['dns']['A']
            })
            
        bgp_data = dossier.get('bgp') or dossier.get('lookup_bgp', {})
        if 'asn' in bgp_data:
            findings.append({
                'type': 'network_ownership',
                'title': 'Network Ownership',
                'description': f"Hosted on ASN {bgp_data['asn']} ({bgp_data.get('holder', 'Unknown')}).",
                'confidence': 'HIGH',
                'evidence': [],
                'related_modules': ['bgp'],
                'suggested_targets': [str(bgp_data['asn'])]
            })
            
        subs = domain_data.get('subdomains_ct') or domain_data.get('subdomains', [])
        if subs:
            findings.append({
                'type': 'subdomains_found',
                'title': 'Subdomains Found',
                'description': f"Found {len(subs)} subdomains.",
                'confidence': 'HIGH',
                'evidence': [],
                'related_modules': ['domain'],
                'suggested_targets': subs[:5]
            })
            
        return findings

    def _correlate_ip(self, target, dossier) -> list[dict]:
        findings = []
        bgp_data = dossier.get('bgp') or dossier.get('lookup_bgp', {})
        if 'asn' in bgp_data:
            findings.append({
                'type': 'network_ownership',
                'title': 'Network Ownership',
                'description': f"IP belongs to ASN {bgp_data['asn']} ({bgp_data.get('holder', 'Carrier')}).",
                'confidence': 'HIGH',
                'evidence': [],
                'related_modules': ['bgp'],
                'suggested_targets': [str(bgp_data['asn'])]
            })
            
        ip_data = dossier.get('ip') or dossier.get('lookup_ip', {})
        if 'reverse_dns' in ip_data and ip_data['reverse_dns']:
            findings.append({
                'type': 'reverse_dns',
                'title': 'Reverse DNS',
                'description': f"PTR record points to {ip_data['reverse_dns']}.",
                'confidence': 'HIGH',
                'evidence': [],
                'related_modules': ['ip'],
                'suggested_targets': [ip_data['reverse_dns']]
            })
            
        return findings

    def _correlate_username(self, target, dossier) -> list[dict]:
        findings = []
        user_data = dossier.get('username') or dossier.get('check_username', {})
        found = user_data.get('found', [])
        if found:
            plat_names = [p.get('platform', str(p)) if isinstance(p, dict) else str(p) for p in found]
            findings.append({
                'type': 'social_presence',
                'title': 'Social Media Presence',
                'description': f"Username confirmed on {len(found)} platforms.",
                'confidence': 'HIGH',
                'evidence': plat_names[:5],
                'related_modules': ['username'],
                'suggested_targets': []
            })
        return findings

    def _correlate_phone(self, target, dossier) -> list[dict]:
        findings = []
        phone_data = dossier.get('phone') or dossier.get('lookup_phone', {})
        if 'country' in phone_data or 'carrier' in phone_data:
            findings.append({
                'type': 'phone_intel',
                'title': 'Phone Information',
                'description': f"Country: {phone_data.get('country', 'Unknown')}, Carrier: {phone_data.get('carrier', 'Unknown')}, Type: {phone_data.get('line_type', 'Standard')}",
                'confidence': 'HIGH',
                'evidence': [],
                'related_modules': ['phone'],
                'suggested_targets': []
            })
        return findings

    def _correlate_discord(self, target, dossier) -> list[dict]:
        findings = []
        discord_data = dossier.get('discord') or dossier.get('lookup_discord', {})
        if 'account_age_days' in discord_data:
            findings.append({
                'type': 'discord_age',
                'title': 'Discord Account Age',
                'description': f"Account age: {discord_data.get('account_age_days')} days (Created {discord_data.get('created_at', '')}).",
                'confidence': 'HIGH',
                'evidence': [],
                'related_modules': ['discord'],
                'suggested_targets': []
            })
        return findings
