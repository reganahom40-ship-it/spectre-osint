"""
Normalized breach and paste data models for SPECTRE intelligence platform.
Structures HIBP API responses into scored, serializable records.
"""
from dataclasses import dataclass, field
from typing import Optional


# Weighted sensitivity scores by data class — higher = more dangerous exposure
_SENSITIVITY_WEIGHTS = {
    'Passwords': 0.30,
    'Plaintext Passwords': 0.30,
    'Password hints': 0.15,
    'Credit cards': 0.25,
    'Bank account numbers': 0.25,
    'Financial data': 0.25,
    'Payment histories': 0.20,
    'Phone numbers': 0.15,
    'Physical addresses': 0.15,
    'Dates of birth': 0.15,
    'Social security numbers': 0.25,
    'Government issued IDs': 0.25,
    'Passport numbers': 0.25,
    'IP addresses': 0.10,
    'Geo locations': 0.10,
    'Private messages': 0.15,
    'Chat logs': 0.10,
    'Security questions and answers': 0.20,
    'Auth tokens': 0.25,
    'Email addresses': 0.05,
    'Usernames': 0.05,
    'Names': 0.05,
}


@dataclass
class BreachRecord:
    name: str
    domain: str
    breach_date: str
    added_date: str
    modified_date: str
    pwn_count: int
    description: str
    data_classes: list[str] = field(default_factory=list)
    is_verified: bool = False
    is_fabricated: bool = False
    is_sensitive: bool = False
    is_retired: bool = False
    is_spam_list: bool = False
    logo_path: str = ''

    def sensitivity_score(self) -> float:
        """0.0–1.0 weighted score based on what data was exposed."""
        if not self.data_classes:
            return 0.0
        total = sum(
            _SENSITIVITY_WEIGHTS.get(dc, 0.02)
            for dc in self.data_classes
        )
        return min(total, 1.0)

    def to_dict(self) -> dict:
        return {
            'name': self.name,
            'domain': self.domain,
            'breach_date': self.breach_date,
            'added_date': self.added_date,
            'modified_date': self.modified_date,
            'pwn_count': self.pwn_count,
            'description': self.description,
            'data_classes': self.data_classes,
            'is_verified': self.is_verified,
            'is_fabricated': self.is_fabricated,
            'is_sensitive': self.is_sensitive,
            'is_retired': self.is_retired,
            'is_spam_list': self.is_spam_list,
            'logo_path': self.logo_path,
            'sensitivity_score': round(self.sensitivity_score(), 3),
        }


@dataclass
class PasteRecord:
    source: str
    id: str
    title: str
    date: str
    email_count: int

    def to_dict(self) -> dict:
        return {
            'source': self.source,
            'id': self.id,
            'title': self.title,
            'date': self.date,
            'email_count': self.email_count,
        }


@dataclass
class BreachSummary:
    email: str
    total_breaches: int = 0
    total_pastes: int = 0
    earliest_breach: str = ''
    latest_breach: str = ''
    total_records_exposed: int = 0
    unique_data_classes: list[str] = field(default_factory=list)
    breaches: list[BreachRecord] = field(default_factory=list)
    pastes: list[PasteRecord] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            'email': self.email,
            'total_breaches': self.total_breaches,
            'total_pastes': self.total_pastes,
            'earliest_breach': self.earliest_breach,
            'latest_breach': self.latest_breach,
            'total_records_exposed': self.total_records_exposed,
            'unique_data_classes': self.unique_data_classes,
            'breaches': [b.to_dict() for b in self.breaches],
            'pastes': [p.to_dict() for p in self.pastes],
        }
