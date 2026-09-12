"""
Normalized investigation timeline builder.
"""
import logging
from datetime import datetime
from modules.models import TimelineEvent, Confidence, TargetType

logger = logging.getLogger(__name__)

class TimelineBuilder:
    def build(self, provider_results: list, target_type) -> list[TimelineEvent]:
        events = []
        dossier = {pr.provider_name: pr.data for pr in provider_results}
        
        domain_data = dossier.get('domain') or dossier.get('lookup_domain')
        email_data = dossier.get('email') or dossier.get('lookup_email')
        breach_data = dossier.get('breaches') or dossier.get('check_breaches')
        discord_data = dossier.get('discord') or dossier.get('lookup_discord')
        ip_data = dossier.get('ip') or dossier.get('lookup_ip')

        if domain_data:
            events.extend(self._extract_domain_events(domain_data))
        if email_data:
            events.extend(self._extract_email_events(email_data))
        if breach_data:
            events.extend(self._extract_breach_events(breach_data))
        if discord_data:
            events.extend(self._extract_discord_events(discord_data))
        if ip_data and target_type == TargetType.IP:
            events.extend(self._extract_ip_events(ip_data))

        valid_events = [e for e in events if e.timestamp]
        valid_events.sort(key=lambda x: x.timestamp)
        
        seen = set()
        deduped = []
        for e in valid_events:
            key = (e.timestamp, e.event_type)
            if key not in seen:
                seen.add(key)
                deduped.append(e)
                
        return deduped

    def _extract_domain_events(self, domain_data: dict) -> list[TimelineEvent]:
        events = []
        if 'whois' in domain_data:
            creation = self._parse_date(domain_data['whois'].get('creation_date'))
            if creation:
                events.append(TimelineEvent(
                    timestamp=creation,
                    source_module='lookup_domain',
                    event_type='Domain Registered',
                    title='Domain Registered',
                    description=f"Domain registered",
                    confidence=Confidence.HIGH
                ))
            expiration = self._parse_date(domain_data['whois'].get('expiration_date'))
            if expiration:
                events.append(TimelineEvent(
                    timestamp=expiration,
                    source_module='lookup_domain',
                    event_type='Domain Expires',
                    title='Domain Expires',
                    description=f"Domain expires",
                    confidence=Confidence.HIGH
                ))
        if 'ssl' in domain_data:
            not_before = self._parse_date(domain_data['ssl'].get('notBefore'))
            if not_before:
                events.append(TimelineEvent(
                    timestamp=not_before,
                    source_module='lookup_domain',
                    event_type='SSL Certificate Issued',
                    title='SSL Certificate Issued',
                    description=f"SSL certificate issued",
                    confidence=Confidence.HIGH
                ))
            not_after = self._parse_date(domain_data['ssl'].get('notAfter'))
            if not_after:
                events.append(TimelineEvent(
                    timestamp=not_after,
                    source_module='lookup_domain',
                    event_type='SSL Certificate Expires',
                    title='SSL Certificate Expires',
                    description=f"SSL certificate expires",
                    confidence=Confidence.HIGH
                ))
        return events

    def _extract_email_events(self, email_data: dict) -> list[TimelineEvent]:
        events = []
        if 'domain_whois' in email_data:
            creation = self._parse_date(email_data['domain_whois'].get('creation_date'))
            if creation:
                events.append(TimelineEvent(
                    timestamp=creation,
                    source_module='lookup_email',
                    event_type='Email Domain Registered',
                    title='Email Domain Registered',
                    description=f"Email domain registered",
                    confidence=Confidence.HIGH
                ))
        return events

    def _extract_breach_events(self, breach_data: dict) -> list[TimelineEvent]:
        events = []
        for breach in breach_data.get('breaches', []):
            date_str = breach.get('breach_date') or breach.get('added_date')
            dt = self._parse_date(date_str)
            if dt:
                name = breach.get('name', 'Unknown')
                events.append(TimelineEvent(
                    timestamp=dt,
                    source_module='check_breaches',
                    event_type=f"Exposed in {name} Breach",
                    title=f"Exposed in {name} Breach",
                    description=f"Data exposed in {name} breach",
                    confidence=Confidence.HIGH
                ))
        for paste in breach_data.get('pastes', []):
            date_str = paste.get('date')
            dt = self._parse_date(date_str)
            if dt:
                source = paste.get('source', 'Unknown')
                events.append(TimelineEvent(
                    timestamp=dt,
                    source_module='check_breaches',
                    event_type=f"Found in Paste on {source}",
                    title=f"Found in Paste on {source}",
                    description=f"Found in paste on {source}",
                    confidence=Confidence.HIGH
                ))
        return events

    def _extract_discord_events(self, discord_data: dict) -> list[TimelineEvent]:
        events = []
        created_at = self._parse_date(discord_data.get('created_at'))
        if created_at:
            events.append(TimelineEvent(
                timestamp=created_at,
                source_module='lookup_discord',
                event_type='Discord Account Created',
                title='Discord Account Created',
                description=f"Discord account created",
                confidence=Confidence.HIGH
            ))
        return events

    def _extract_ip_events(self, ip_data: dict) -> list[TimelineEvent]:
        return [TimelineEvent(
            timestamp=datetime.utcnow().isoformat() + "Z",
            source_module='lookup_ip',
            event_type='IP Intelligence Captured',
            title='IP Intelligence Captured',
            description="IP intelligence captured",
            confidence=Confidence.HIGH
        )]

    def _parse_date(self, date_val) -> str | None:
        if not date_val:
            return None
        if isinstance(date_val, list):
            date_val = date_val[0]
        if isinstance(date_val, datetime):
            return date_val.isoformat() + "Z"
        if isinstance(date_val, str):
            try:
                dt = datetime.fromisoformat(date_val.replace("Z", "+00:00"))
                return dt.isoformat()
            except ValueError:
                return date_val
        return str(date_val)
