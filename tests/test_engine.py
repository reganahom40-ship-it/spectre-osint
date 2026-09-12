"""
Unit tests for the SPECTRE Investigation Engine and Input Classifier.
"""
from modules.models import TargetType, Confidence, ErrorType
from modules.engine import InputClassifier, InvestigationEngine
from modules.cache import investigation_cache, TTLCache

def test_input_classifier_types():
    assert InputClassifier.classify("AS15169").target_type == TargetType.ASN
    assert InputClassifier.classify("8.8.8.8").target_type == TargetType.IP
    assert InputClassifier.classify("+14155552671").target_type == TargetType.PHONE
    assert InputClassifier.classify("target@example.com").target_type == TargetType.EMAIL
    assert InputClassifier.classify("google.com").target_type == TargetType.DOMAIN
    assert InputClassifier.classify("https://example.com/test").target_type == TargetType.DOMAIN
    assert InputClassifier.classify("d41d8cd98f00b204e9800998ecf8427e").target_type == TargetType.HASH
    assert InputClassifier.classify("80").target_type == TargetType.PORT
    assert InputClassifier.classify("ghost_rider").target_type == TargetType.USERNAME

def test_cache_ttl_and_hashing():
    cache = TTLCache(max_size=50)
    key = TTLCache.hash_key("test_provider", "secret_target")
    assert len(key) == 64
    
    cache.set(key, {"sample": "data"}, ttl=60)
    val = cache.get(key)
    assert val == {"sample": "data"}

    # Expired entry
    cache.set(key, {"sample": "expired"}, ttl=-1)
    assert cache.get(key) is None

def test_engine_investigate_structure():
    engine = InvestigationEngine(max_workers=4)
    res = engine.investigate("443")
    assert res['detected_type'] == "port"
    assert "investigation_id" in res
    assert "dossier" in res
    assert "graph" in res
    assert "nodes" in res['graph']
    assert "edges" in res['graph']
    assert "timeline" in res
    assert "correlations" in res
    assert "duration_ms" in res
