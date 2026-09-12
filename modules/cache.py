"""
Thread-safe in-memory TTL cache for the SPECTRE OSINT platform.
"""
import threading
import time
import hashlib
from collections import OrderedDict
from dataclasses import dataclass
from typing import Any, Optional

TTL_DNS = 3600
TTL_WHOIS = 86400
TTL_BREACH = 21600
TTL_USERNAME = 1800
TTL_IP_GEO = 7200
TTL_HEADERS = 1800
TTL_BGP = 3600
TTL_HASH = 86400
TTL_PHONE = 86400

@dataclass
class CacheEntry:
    value: Any
    expires_at: float
    created_at: float

class TTLCache:
    def __init__(self, max_size=1000):
        self.max_size = max_size
        self._cache = OrderedDict()
        self._lock = threading.Lock()
        self._hits = 0
        self._misses = 0

    def get(self, key: str) -> Optional[Any]:
        with self._lock:
            if key in self._cache:
                entry = self._cache[key]
                if time.time() < entry.expires_at:
                    self._cache.move_to_end(key)
                    self._hits += 1
                    return entry.value
                else:
                    del self._cache[key]
            self._misses += 1
            return None

    def set(self, key: str, value: Any, ttl: int):
        with self._lock:
            if len(self._cache) >= self.max_size and key not in self._cache:
                self._cache.popitem(last=False)
            self._cache[key] = CacheEntry(
                value=value,
                expires_at=time.time() + ttl,
                created_at=time.time()
            )
            self._cache.move_to_end(key)

    def delete(self, key: str):
        with self._lock:
            if key in self._cache:
                del self._cache[key]

    def clear(self):
        with self._lock:
            self._cache.clear()
            self._hits = 0
            self._misses = 0

    def stats(self) -> dict:
        with self._lock:
            return {
                "size": len(self._cache),
                "hits": self._hits,
                "misses": self._misses,
                "max_size": self.max_size
            }

    def _evict_expired(self):
        with self._lock:
            now = time.time()
            keys_to_delete = [k for k, v in self._cache.items() if now >= v.expires_at]
            for k in keys_to_delete:
                del self._cache[k]

    @classmethod
    def hash_key(cls, *args) -> str:
        key_str = "_".join(str(arg) for arg in args)
        return hashlib.sha256(key_str.encode('utf-8')).hexdigest()

investigation_cache = TTLCache(max_size=2000)
