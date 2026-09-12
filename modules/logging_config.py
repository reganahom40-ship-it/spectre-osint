"""
Structured logging configuration for SPECTRE intelligence platform.
Emits JSON logs without persisting raw target queries (hashes PII).
"""
import logging
import json
import hashlib
import time

class StructuredJsonFormatter(logging.Formatter):
    """Formats log records as single-line JSON objects."""
    def format(self, record: logging.LogRecord) -> str:
        log_obj = {
            'timestamp': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime(record.created)),
            'level': record.levelname,
            'logger': record.name,
            'message': record.getMessage(),
        }
        if hasattr(record, 'investigation_id'):
            log_obj['investigation_id'] = record.investigation_id
        if hasattr(record, 'target_hash'):
            log_obj['target_hash'] = record.target_hash
        if hasattr(record, 'target_type'):
            log_obj['target_type'] = record.target_type
        if hasattr(record, 'duration_ms'):
            log_obj['duration_ms'] = record.duration_ms
        if record.exc_info:
            log_obj['exception'] = self.formatException(record.exc_info)
        return json.dumps(log_obj)


def setup_logging(level: int = logging.INFO):
    """Initializes structured logger for the root application."""
    handler = logging.StreamHandler()
    handler.setFormatter(StructuredJsonFormatter())
    root = logging.getLogger()
    root.setLevel(level)
    # Clear existing handlers to prevent duplicates
    if root.handlers:
        root.handlers.clear()
    root.addHandler(handler)


def log_investigation_summary(investigation_id: str, target: str, target_type: str, duration_ms: float, error_count: int = 0):
    """Safely logs an investigation event with a SHA-256 target digest."""
    target_hash = hashlib.sha256(target.strip().lower().encode('utf-8')).hexdigest()[:16]
    logger = logging.getLogger('spectre.investigation')
    extra = {
        'investigation_id': investigation_id,
        'target_hash': target_hash,
        'target_type': target_type,
        'duration_ms': duration_ms,
    }
    logger.info(
        f"Investigation completed: type={target_type} duration={duration_ms}ms errors={error_count}",
        extra=extra
    )
