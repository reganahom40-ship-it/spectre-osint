"""
Base provider abstraction for the SPECTRE OSINT platform.
"""
from abc import ABC, abstractmethod
import time
from modules.models import ProviderResult, ErrorType, Confidence

class BaseProvider(ABC):
    version: str = '1.0'

    @property
    @abstractmethod
    def name(self) -> str:
        pass

    @abstractmethod
    def search(self, query: str) -> ProviderResult:
        pass

    def health(self) -> dict:
        return {'status': 'ok', 'provider': self.name}

    def is_available(self) -> bool:
        return True

    def rate_limit_info(self) -> dict:
        return {}

class CircuitBreaker:
    def __init__(self, failure_threshold=3, recovery_timeout=300):
        self.failure_threshold = failure_threshold
        self.recovery_timeout = recovery_timeout
        self._failures = 0
        self._last_failure_time = 0.0

    def record_success(self):
        self._failures = 0

    def record_failure(self):
        self._failures += 1
        self._last_failure_time = time.time()

    def is_open(self) -> bool:
        if self._failures >= self.failure_threshold:
            if time.time() - self._last_failure_time < self.recovery_timeout:
                return True
            else:
                return False
        return False

    @property
    def state(self) -> str:
        if self._failures >= self.failure_threshold:
            if time.time() - self._last_failure_time < self.recovery_timeout:
                return "OPEN"
            else:
                return "HALF_OPEN"
        return "CLOSED"
