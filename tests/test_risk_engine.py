"""
Unit tests for the explainable breach risk scoring engine.
"""
from datetime import datetime, timedelta
from modules.breach_models import BreachRecord, BreachSummary, PasteRecord
from modules.risk_engine import RiskEngine

def test_risk_score_zero_on_clean():
    engine = RiskEngine()
    score = engine.calculate(None)
    assert score.score == 0
    assert score.severity == "MINIMAL"

    empty_summary = BreachSummary(email="clean@example.com")
    score_empty = engine.calculate(empty_summary)
    assert score_empty.score == 0
    assert score_empty.severity == "MINIMAL"

def test_risk_score_high_on_sensitive_recent_breach():
    engine = RiskEngine()
    recent_date = (datetime.utcnow() - timedelta(days=30)).strftime("%Y-%m-%d")
    
    breach = BreachRecord(
        name="CriticalDump",
        domain="criticaldump.com",
        breach_date=recent_date,
        added_date=recent_date,
        modified_date=recent_date,
        pwn_count=5000000,
        description="Massive credential breach",
        data_classes=["Plaintext Passwords", "Credit cards", "Email addresses"],
        is_verified=True
    )
    
    summary = BreachSummary(
        email="target@example.com",
        total_breaches=1,
        total_pastes=1,
        earliest_breach=recent_date,
        latest_breach=recent_date,
        total_records_exposed=5000000,
        unique_data_classes=["Plaintext Passwords", "Credit cards", "Email addresses"],
        breaches=[breach],
        pastes=[PasteRecord(source="Pastebin", id="xyz123", title="Leaked DB", date=recent_date, email_count=1000)]
    )

    result = engine.calculate(summary)
    assert result.score > 50, f"Expected score > 50, got {result.score}"
    assert result.severity in ("HIGH", "CRITICAL"), f"Expected HIGH/CRITICAL severity, got {result.severity}"
    assert len(result.factors) == 5
    
    recency_factor = next(f for f in result.factors if f['name'] == 'Recency')
    assert recency_factor['score'] == 25, f"Expected 25 recency points, got {recency_factor['score']}"
