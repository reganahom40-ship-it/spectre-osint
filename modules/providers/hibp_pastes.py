"""
Have I Been Pwned API v3 — Paste Accounts provider.
Queries HIBP for paste exposure metadata associated with an email address.
Only returns metadata (source, title, date, count). NEVER displays paste content.
"""
import os
import re
import time
import logging
import requests

from modules.providers import BaseProvider
from modules.models import ProviderResult, Confidence, ErrorType
from modules.breach_models import PasteRecord
from modules.cache import investigation_cache, TTL_BREACH, TTLCache

logger = logging.getLogger(__name__)

_EMAIL_RE = re.compile(r'^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$')
_API_BASE = 'https://haveibeenpwned.com/api/v3'


class HIBPPasteProvider(BaseProvider):
    """Queries HIBP for paste dump exposure metadata on an email address."""

    @property
    def name(self) -> str:
        return 'hibp_pastes'

    def __init__(self):
        self.api_key = os.environ.get('HIBP_API_KEY', '')
        self.user_agent = os.environ.get('HIBP_USER_AGENT', 'SPECTRE-OSINT-Platform')

    def is_available(self) -> bool:
        return bool(self.api_key)

    def search(self, email: str) -> ProviderResult:
        start = time.time()

        if not _EMAIL_RE.match(email):
            return ProviderResult(
                provider_name=self.name,
                source_url=_API_BASE,
                query=email,
                timestamp=start,
                confidence=Confidence.UNVERIFIED,
                error_type=ErrorType.PROVIDER_ERROR,
                error_message='Invalid email format',
            )

        if not self.is_available():
            return ProviderResult(
                provider_name=self.name,
                source_url=_API_BASE,
                query=email,
                timestamp=start,
                confidence=Confidence.UNVERIFIED,
                error_type=ErrorType.UNAUTHORIZED,
                error_message='HIBP_API_KEY not configured',
            )

        cache_key = TTLCache.hash_key('hibp_paste', email.lower())
        cached = investigation_cache.get(cache_key)
        if cached is not None:
            elapsed = (time.time() - start) * 1000
            return ProviderResult(
                provider_name=self.name,
                source_url=_API_BASE,
                query=email,
                timestamp=start,
                confidence=Confidence.CONFIRMED,
                duration_ms=elapsed,
                data=cached,
            )

        url = f'{_API_BASE}/pasteaccount/{requests.utils.quote(email)}'
        headers = {
            'hibp-api-key': self.api_key,
            'user-agent': self.user_agent,
        }

        try:
            resp = requests.get(url, headers=headers, timeout=10)
        except requests.Timeout:
            return ProviderResult(
                provider_name=self.name, source_url=url, query=email,
                timestamp=start, confidence=Confidence.UNVERIFIED,
                error_type=ErrorType.TIMEOUT,
                error_message='HIBP paste API timed out',
                duration_ms=(time.time() - start) * 1000,
            )
        except requests.RequestException as exc:
            return ProviderResult(
                provider_name=self.name, source_url=url, query=email,
                timestamp=start, confidence=Confidence.UNVERIFIED,
                error_type=ErrorType.PROVIDER_ERROR,
                error_message=str(exc),
                duration_ms=(time.time() - start) * 1000,
            )

        elapsed = (time.time() - start) * 1000

        if resp.status_code == 404:
            result_data = {'total_pastes': 0, 'pastes': []}
            investigation_cache.set(cache_key, result_data, TTL_BREACH)
            return ProviderResult(
                provider_name=self.name, source_url=url, query=email,
                timestamp=start, confidence=Confidence.CONFIRMED,
                error_type=ErrorType.NO_RESULTS, duration_ms=elapsed,
                data=result_data,
            )

        if resp.status_code == 401:
            return ProviderResult(
                provider_name=self.name, source_url=url, query=email,
                timestamp=start, confidence=Confidence.UNVERIFIED,
                error_type=ErrorType.UNAUTHORIZED,
                error_message='Invalid HIBP API key', duration_ms=elapsed,
            )

        if resp.status_code == 429:
            retry_after = resp.headers.get('Retry-After', '2')
            return ProviderResult(
                provider_name=self.name, source_url=url, query=email,
                timestamp=start, confidence=Confidence.UNVERIFIED,
                error_type=ErrorType.RATE_LIMITED,
                error_message=f'Rate limited — retry after {retry_after}s',
                duration_ms=elapsed,
            )

        if resp.status_code != 200:
            return ProviderResult(
                provider_name=self.name, source_url=url, query=email,
                timestamp=start, confidence=Confidence.UNVERIFIED,
                error_type=ErrorType.PROVIDER_ERROR,
                error_message=f'HIBP returned HTTP {resp.status_code}',
                duration_ms=elapsed,
            )

        raw_pastes = resp.json()
        pastes = [self._normalize_paste(p) for p in raw_pastes]
        pastes.sort(key=lambda p: p.date or '', reverse=True)

        result_data = {
            'total_pastes': len(pastes),
            'pastes': [p.to_dict() for p in pastes],
        }
        investigation_cache.set(cache_key, result_data, TTL_BREACH)

        return ProviderResult(
            provider_name=self.name, source_url=url, query=email,
            timestamp=start, confidence=Confidence.CONFIRMED,
            duration_ms=elapsed, data=result_data,
        )

    def _normalize_paste(self, raw: dict) -> PasteRecord:
        return PasteRecord(
            source=raw.get('Source', 'Unknown'),
            id=str(raw.get('Id', '')),
            title=raw.get('Title') or 'Untitled',
            date=raw.get('Date', ''),
            email_count=raw.get('EmailCount', 0),
        )
