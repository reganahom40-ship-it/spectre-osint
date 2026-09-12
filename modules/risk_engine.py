"""
Explainable breach risk scoring engine for SPECTRE.
Produces a 0–100 risk score with per-factor breakdowns so the user
understands WHY the score exists, not just the number.
"""
from datetime import datetime, timedelta
from typing import Optional

from modules.breach_models import BreachRecord, BreachSummary, PasteRecord
from modules.models import RiskScore


class RiskEngine:
    """Calculates an explainable 0–100 risk score from breach data."""

    def calculate(self, breach_summary: Optional[BreachSummary]) -> RiskScore:
        """Main entry point — takes a BreachSummary and returns a RiskScore."""
        if breach_summary is None or breach_summary.total_breaches == 0:
            return RiskScore(
                score=0,
                severity='MINIMAL',
                factors=[],
                summary='No known breach exposure detected.',
            )

        breaches = breach_summary.breaches
        pastes = breach_summary.pastes

        recency_pts, recency_why = self._recency_score(breaches)
        sensitivity_pts, sensitivity_why = self._sensitivity_score(breaches)
        frequency_pts, frequency_why = self._frequency_score(len(breaches))
        verification_pts, verification_why = self._verification_score(breaches)
        paste_pts, paste_why = self._paste_exposure_score(pastes)

        total = recency_pts + sensitivity_pts + frequency_pts + verification_pts + paste_pts
        total = min(total, 100)

        factors = [
            {'name': 'Recency', 'score': recency_pts, 'max_score': 25, 'explanation': recency_why},
            {'name': 'Data Sensitivity', 'score': sensitivity_pts, 'max_score': 30, 'explanation': sensitivity_why},
            {'name': 'Breach Frequency', 'score': frequency_pts, 'max_score': 20, 'explanation': frequency_why},
            {'name': 'Source Verification', 'score': verification_pts, 'max_score': 10, 'explanation': verification_why},
            {'name': 'Paste Exposure', 'score': paste_pts, 'max_score': 15, 'explanation': paste_why},
        ]

        severity = self._severity_label(total)
        summary = self._build_summary(total, severity, breach_summary)

        return RiskScore(
            score=total,
            severity=severity,
            factors=factors,
            summary=summary,
        )

    # ------------------------------------------------------------------
    # Factor calculators — each returns (score, explanation)
    # ------------------------------------------------------------------

    def _recency_score(self, breaches: list[BreachRecord]) -> tuple[int, str]:
        """0–25 pts based on how recent the breaches are."""
        if not breaches:
            return 0, 'No breaches to evaluate.'

        now = datetime.utcnow()
        most_recent = None
        for b in breaches:
            try:
                d = datetime.strptime(b.breach_date[:10], '%Y-%m-%d')
                if most_recent is None or d > most_recent:
                    most_recent = d
            except (ValueError, TypeError):
                continue

        if most_recent is None:
            return 5, 'Breach dates could not be parsed.'

        age = now - most_recent
        if age <= timedelta(days=730):  # 2 years
            return 25, f'Most recent breach occurred {age.days} days ago (within 2 years) — HIGH recency risk.'
        if age <= timedelta(days=1825):  # 5 years
            return 15, f'Most recent breach was {age.days // 365} years ago — MODERATE recency risk.'
        return 5, f'Most recent breach was {age.days // 365}+ years ago — LOW recency risk.'

    def _sensitivity_score(self, breaches: list[BreachRecord]) -> tuple[int, str]:
        """0–30 pts based on what types of data were exposed."""
        if not breaches:
            return 0, 'No breaches to evaluate.'

        scores = [b.sensitivity_score() for b in breaches]
        avg_sensitivity = sum(scores) / len(scores)

        # Map 0.0–1.0 sensitivity to 0–30 points
        pts = round(avg_sensitivity * 30)

        # Build human-readable list of the most dangerous exposed data classes
        all_classes = set()
        for b in breaches:
            all_classes.update(b.data_classes)

        dangerous = [c for c in all_classes if c in (
            'Passwords', 'Plaintext Passwords', 'Credit cards',
            'Bank account numbers', 'Social security numbers',
            'Auth tokens', 'Security questions and answers',
        )]

        if dangerous:
            return pts, f'High-sensitivity data exposed: {", ".join(dangerous)}.'
        if pts > 10:
            return pts, f'Moderate sensitivity — {len(all_classes)} data classes exposed across {len(breaches)} breaches.'
        return pts, f'Low sensitivity data only ({len(all_classes)} data classes).'

    def _frequency_score(self, breach_count: int) -> tuple[int, str]:
        """0–20 pts based on number of breaches."""
        if breach_count == 0:
            return 0, 'No breaches.'
        if breach_count == 1:
            return 5, 'Single breach exposure.'
        if breach_count <= 3:
            return 10, f'Appeared in {breach_count} breaches — moderate frequency.'
        if breach_count <= 6:
            return 15, f'Appeared in {breach_count} breaches — elevated frequency.'
        return 20, f'Appeared in {breach_count} breaches — HIGH frequency exposure.'

    def _verification_score(self, breaches: list[BreachRecord]) -> tuple[int, str]:
        """0–10 pts based on percentage of verified breaches."""
        if not breaches:
            return 0, 'No breaches to evaluate.'

        verified = sum(1 for b in breaches if b.is_verified)
        pct = verified / len(breaches)
        pts = round(pct * 10)

        if pct >= 0.8:
            return pts, f'{verified}/{len(breaches)} breaches are verified — HIGH confidence data.'
        if pct >= 0.5:
            return pts, f'{verified}/{len(breaches)} breaches verified — moderate confidence.'
        return pts, f'Only {verified}/{len(breaches)} breaches verified — lower confidence.'

    def _paste_exposure_score(self, pastes: list[PasteRecord]) -> tuple[int, str]:
        """0–15 pts based on paste dump exposure."""
        if not pastes:
            return 0, 'No paste exposure detected.'
        if len(pastes) >= 5:
            return 15, f'Found in {len(pastes)} paste dumps — significant underground circulation.'
        return 10, f'Found in {len(pastes)} paste dump(s) — indicates active data circulation.'

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _severity_label(score: int) -> str:
        if score >= 81:
            return 'CRITICAL'
        if score >= 61:
            return 'HIGH'
        if score >= 41:
            return 'MEDIUM'
        if score >= 21:
            return 'LOW'
        return 'MINIMAL'

    @staticmethod
    def _build_summary(score: int, severity: str, summary: BreachSummary) -> str:
        parts = [f'Risk score: {score}/100 ({severity}).']
        if summary.total_breaches > 0:
            parts.append(f'Found in {summary.total_breaches} known breach(es).')
        if summary.total_pastes > 0:
            parts.append(f'Appeared in {summary.total_pastes} paste dump(s).')
        if summary.earliest_breach and summary.latest_breach:
            parts.append(
                f'Exposure window: {summary.earliest_breach} to {summary.latest_breach}.'
            )
        if summary.total_records_exposed:
            parts.append(
                f'Approximately {summary.total_records_exposed:,} total records exposed across all breaches.'
            )
        return ' '.join(parts)
