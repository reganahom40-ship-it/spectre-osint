"""
Have I Been Pwned API v3 — Breached Accounts provider.
Queries HIBP for breach data associated with an email address.
API key is required and NEVER exposed to the frontend.
"""
import os
import re
import time
import logging
import requests

from modules.providers import BaseProvider
from modules.models import ProviderResult, Confidence, ErrorType
from modules.breach_models import BreachRecord, BreachSummary
from modules.cache import investigation_cache, TTL_BREACH, TTLCache

logger = logging.getLogger(__name__)

_EMAIL_RE = re.compile(r'^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$')
_API_BASE = 'https://haveibeenpwned.com/api/v3'


class HIBPBreachProvider(BaseProvider):
    """Queries Have I Been Pwned for breach exposure on an email address."""

    @property
    def name(self) -> str:
        return 'hibp_breaches'

    def __init__(self):
        self.api_key = os.environ.get('HIBP_API_KEY', '')
        self.user_agent = os.environ.get('HIBP_USER_AGENT', 'SPECTRE-OSINT-Platform')
        if not self.api_key:
            logger.warning('HIBP_API_KEY not set — breach lookups will be unavailable')

    def is_available(self) -> bool:
        return bool(self.api_key)

    def rate_limit_info(self) -> dict:
        return {
            'provider': self.name,
            'requests_per_minute': 10,
            'note': 'HIBP rate limits to ~10 req/min on paid keys'
        }

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

        # Privacy-safe cache key — never store raw email
        cache_key = TTLCache.hash_key('hibp_breach', email.lower())
        cached = investigation_cache.get(cache_key)
        if cached is not None:
            elapsed = (time.time() - start) * 1000
            cached['_from_cache'] = True
            return ProviderResult(
                provider_name=self.name,
                source_url=_API_BASE,
                query=email,
                timestamp=start,
                confidence=Confidence.CONFIRMED,
                duration_ms=elapsed,
                data=cached,
            )

        url = f'{_API_BASE}/breachedaccount/{requests.utils.quote(email)}?truncateResponse=false'
        headers = {
            'hibp-api-key': self.api_key,
            'user-agent': self.user_agent,
        }

        try:
            resp = requests.get(url, headers=headers, timeout=10)
        except requests.Timeout:
            return ProviderResult(
                provider_name=self.name,
                source_url=url,
                query=email,
                timestamp=start,
                confidence=Confidence.UNVERIFIED,
                error_type=ErrorType.TIMEOUT,
                error_message='HIBP API request timed out',
                duration_ms=(time.time() - start) * 1000,
            )
        except requests.RequestException as exc:
            return ProviderResult(
                provider_name=self.name,
                source_url=url,
                query=email,
                timestamp=start,
                confidence=Confidence.UNVERIFIED,
                error_type=ErrorType.PROVIDER_ERROR,
                error_message=str(exc),
                duration_ms=(time.time() - start) * 1000,
            )

        elapsed = (time.time() - start) * 1000

        # 404 = no breaches found — this is a valid "clean" result
        if resp.status_code == 404:
            result_data = BreachSummary(email=email).to_dict()
            investigation_cache.set(cache_key, result_data, TTL_BREACH)
            return ProviderResult(
                provider_name=self.name,
                source_url=url,
                query=email,
                timestamp=start,
                confidence=Confidence.CONFIRMED,
                error_type=ErrorType.NO_RESULTS,
                duration_ms=elapsed,
                data=result_data,
            )

        if resp.status_code == 401:
            return ProviderResult(
                provider_name=self.name,
                source_url=url,
                query=email,
                timestamp=start,
                confidence=Confidence.UNVERIFIED,
                error_type=ErrorType.UNAUTHORIZED,
                error_message='Invalid HIBP API key',
                duration_ms=elapsed,
            )

        if resp.status_code == 429:
            retry_after = resp.headers.get('Retry-After', '2')
            return ProviderResult(
                provider_name=self.name,
                source_url=url,
                query=email,
                timestamp=start,
                confidence=Confidence.UNVERIFIED,
                error_type=ErrorType.RATE_LIMITED,
                error_message=f'Rate limited — retry after {retry_after}s',
                duration_ms=elapsed,
            )

        if resp.status_code != 200:
            return ProviderResult(
                provider_name=self.name,
                source_url=url,
                query=email,
                timestamp=start,
                confidence=Confidence.UNVERIFIED,
                error_type=ErrorType.PROVIDER_ERROR,
                error_message=f'HIBP returned HTTP {resp.status_code}',
                duration_ms=elapsed,
            )

        # 200 — parse breach array
        raw_breaches = resp.json()
        breaches = [self._normalize_breach(b) for b in raw_breaches]

        # Sort by breach date descending (most recent first)
        breaches.sort(key=lambda b: b.breach_date, reverse=True)

        # Build summary
        all_dates = [b.breach_date for b in breaches if b.breach_date]
        all_classes = set()
        total_exposed = 0
        for b in breaches:
            all_classes.update(b.data_classes)
            total_exposed += b.pwn_count

        summary = BreachSummary(
            email=email,
            total_breaches=len(breaches),
            earliest_breach=min(all_dates) if all_dates else '',
            latest_breach=max(all_dates) if all_dates else '',
            total_records_exposed=total_exposed,
            unique_data_classes=sorted(all_classes),
            breaches=breaches,
        )

        result_data = summary.to_dict()
        investigation_cache.set(cache_key, result_data, TTL_BREACH)

        return ProviderResult(
            provider_name=self.name,
            source_url=url,
            query=email,
            timestamp=start,
            confidence=Confidence.CONFIRMED,
            duration_ms=elapsed,
            data=result_data,
        )

    def _normalize_breach(self, raw: dict) -> BreachRecord:
        """Converts a raw HIBP API breach object into a BreachRecord."""
        return BreachRecord(
            name=raw.get('Name', ''),
            domain=raw.get('Domain', ''),
            breach_date=raw.get('BreachDate', ''),
            added_date=raw.get('AddedDate', ''),
            modified_date=raw.get('ModifiedDate', ''),
            pwn_count=raw.get('PwnCount', 0),
            description=raw.get('Description', ''),
            data_classes=raw.get('DataClasses', []),
            is_verified=raw.get('IsVerified', False),
            is_fabricated=raw.get('IsFabricated', False),
            is_sensitive=raw.get('IsSensitive', False),
            is_retired=raw.get('IsRetired', False),
            is_spam_list=raw.get('IsSpamList', False),
            logo_path=f"https://haveibeenpwned.com/Content/Images/PwnedLogos/{raw.get('Name', '')}.png",
        )
