"""
Core investigation engine for the SPECTRE OSINT platform.
Orchestrates multi-source reconnaissance, breach intelligence,
correlation, timeline synthesis, and 3D graph construction.
"""
import re
import time
import uuid
import logging
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Optional

from modules.models import (
    TargetClassification, TargetType, Confidence, ErrorType,
    ProviderResult, InvestigationResult, TimelineEvent, GraphNode, GraphEdge, RiskScore
)
from modules.cache import investigation_cache, TTL_BREACH, TTLCache

# Real module imports
from modules.email_lookup import lookup_email
from modules.ip_lookup import lookup_ip
from modules.bgp_lookup import lookup_bgp
from modules.domain_lookup import lookup_domain
from modules.headers import analyze_headers
from modules.username import check_username
from modules.phone_lookup import lookup_phone
from modules.number_forensics import analyze_number
from modules.discord_lookup import lookup_discord
from modules.hash_lookup import analyze_hash
from modules.dork_generator import generate_dorks

from modules.providers.hibp import HIBPBreachProvider
from modules.providers.hibp_pastes import HIBPPasteProvider
from modules.breach_models import BreachRecord, BreachSummary, PasteRecord
from modules.risk_engine import RiskEngine
from modules.timeline import TimelineBuilder
from modules.graph_builder import GraphBuilder
from modules.correlator import IntelligenceCorrelator

logger = logging.getLogger(__name__)


class InputClassifier:
    """Classifies user queries into TargetType with associated confidence and schema info."""
    @staticmethod
    def classify(target: str) -> TargetClassification:
        target = target.strip()
        digits_only = ''.join(c for c in target if c.isdigit())
        is_pure_digits = target.isdigit()
        digit_len = len(target)

        # 1. ASN Check (e.g. AS15169 or AS13335)
        if re.match(r'^AS\d+$', target, re.IGNORECASE):
            return TargetClassification(target, TargetType.ASN, Confidence.CONFIRMED, "Autonomous System Number (BGP)")

        # 2. IPv4 Address Check
        elif re.match(r'^(\d{1,3}\.){3}\d{1,3}$', target):
            return TargetClassification(target, TargetType.IP, Confidence.CONFIRMED, "IPv4 Global Unicast Address")

        # 3. Formatted Phone Number (+, -, (), spaces)
        elif target.startswith('+') or (re.match(r'^\+?[\d\s\-\(\)\.]{7,25}$', target) and len(digits_only) >= 7 and not '.' in target):
            return TargetClassification(target, TargetType.PHONE, Confidence.HIGH, "Global Telephone (E.164)")

        # 4. Pure Digits: Phone, Discord Snowflake, Port, or Generic Number
        elif is_pure_digits:
            num_val = int(target)
            if 15 <= digit_len <= 20:
                return TargetClassification(target, TargetType.DISCORD, Confidence.HIGH, "64-Bit Discord/Twitter Snowflake Timestamp")
            elif 1 <= num_val <= 65535 and digit_len <= 5:
                return TargetClassification(target, TargetType.PORT, Confidence.HIGH, f"IANA Port {num_val}")
            elif 7 <= digit_len <= 15:
                return TargetClassification(target, TargetType.PHONE, Confidence.MEDIUM, "Numeric Phone / E.164 Candidate")
            else:
                return TargetClassification(target, TargetType.NUMBER, Confidence.HIGH, f"Numeric Identifier ({digit_len} Digits)")

        # 5. Email Address Check
        elif '@' in target and '.' in target:
            return TargetClassification(target, TargetType.EMAIL, Confidence.CONFIRMED, "RFC 5322 Standard Email Address")

        # 6. Cryptographic Hash Check
        elif re.match(r'^[a-fA-F0-9]{32}$|^[a-fA-F0-9]{40}$|^[a-fA-F0-9]{64}$', target):
            return TargetClassification(target, TargetType.HASH, Confidence.CONFIRMED, "Hexadecimal Digest / Cryptographic Checksum")

        # 7. Domain / FQDN / URL Check
        elif '.' in target and not target.startswith('+') and ' ' not in target:
            return TargetClassification(target, TargetType.DOMAIN, Confidence.HIGH, "Fully Qualified Domain Name (FQDN)")

        # 8. Username Discovery Default
        else:
            clean_user = target.lstrip('@')
            return TargetClassification(target, TargetType.USERNAME, Confidence.HIGH, f"Social / Web Handle (@{clean_user})")


class InvestigationEngine:
    """Core orchestrator for multi-vector OSINT queries and intelligence synthesis."""
    def __init__(self, max_workers: int = 12, default_timeout: int = 15):
        self.max_workers = max_workers
        self.default_timeout = default_timeout
        self.hibp_breach_provider = HIBPBreachProvider()
        self.hibp_paste_provider = HIBPPasteProvider()
        self.risk_engine = RiskEngine()
        self.timeline_builder = TimelineBuilder()
        self.graph_builder = GraphBuilder()
        self.correlator = IntelligenceCorrelator()

    def investigate(self, target: str) -> dict:
        """Executes full investigation pipeline and returns structured API payload."""
        start_time = time.time()
        target = target.strip()
        classification = InputClassifier.classify(target)
        investigation_id = uuid.uuid4().hex[:12]

        provider_results: list[ProviderResult] = []
        dossier: dict = {}
        summary_intel: dict = {}
        errors: list[dict] = []

        # Build dynamic tasks list based on classified target type
        tasks = self._plan_investigation_tasks(target, classification.target_type)

        with ThreadPoolExecutor(max_workers=self.max_workers) as executor:
            future_to_key = {
                executor.submit(self._run_task, task_key, task_func, task_arg): task_key
                for task_key, task_func, task_arg in tasks
            }

            for future in as_completed(future_to_key):
                task_key = future_to_key[future]
                try:
                    res: ProviderResult = future.result()
                    provider_results.append(res)
                    if res.error_type == ErrorType.NONE or res.data:
                        dossier[task_key] = res.data
                    if res.error_type not in (ErrorType.NONE, ErrorType.NO_RESULTS) and res.error_message:
                        errors.append({
                            'provider': res.provider_name,
                            'error': res.error_message,
                            'type': res.error_type.value
                        })
                except Exception as e:
                    logger.error(f"Task {task_key} failed: {e}")
                    errors.append({'provider': task_key, 'error': str(e), 'type': 'INTERNAL_ERROR'})

        # Secondary correlation / cascading steps
        self._execute_cascade_recon(target, classification.target_type, dossier, provider_results, errors)

        # Risk scoring
        risk_score = None
        breach_summary_data = dossier.get('breaches') or dossier.get('check_breaches')
        if breach_summary_data and isinstance(breach_summary_data, dict):
            try:
                breaches_list = [
                    BreachRecord(**b) if isinstance(b, dict) and 'name' in b else b
                    for b in breach_summary_data.get('breaches', [])
                ]
                pastes_list = [
                    PasteRecord(**p) if isinstance(p, dict) and 'source' in p else p
                    for p in breach_summary_data.get('pastes', [])
                ]
                b_sum = BreachSummary(
                    email=target if classification.target_type == TargetType.EMAIL else '',
                    total_breaches=breach_summary_data.get('total_breaches', len(breaches_list)),
                    total_pastes=breach_summary_data.get('total_pastes', len(pastes_list)),
                    earliest_breach=breach_summary_data.get('earliest_breach', ''),
                    latest_breach=breach_summary_data.get('latest_breach', ''),
                    total_records_exposed=breach_summary_data.get('total_records_exposed', 0),
                    unique_data_classes=breach_summary_data.get('unique_data_classes', []),
                    breaches=breaches_list,
                    pastes=pastes_list
                )
                risk_score = self.risk_engine.calculate(b_sum)
            except Exception as e:
                logger.error(f"Error calculating risk score: {e}")

        # Timeline generation
        timeline_events = self.timeline_builder.build(provider_results, classification.target_type)

        # 3D Graph topology generation
        graph_nodes, graph_edges = self.graph_builder.build(target, classification.target_type, dossier, investigation_id)
        vis_graph = self.graph_builder.to_vis_json(graph_nodes, graph_edges)

        # Cross-module correlations
        correlations = self.correlator.correlate(target, classification.target_type, dossier)

        # Build summary telemetry
        summary_intel = self._build_summary_intel(target, classification.target_type, dossier, risk_score)

        duration_ms = round((time.time() - start_time) * 1000, 2)

        resp_data = {
            'detected_type': classification.target_type.name.lower(),
            'schema_info': classification.schema_info,
            'confidence': classification.confidence.value if isinstance(classification.confidence.value, (int, float)) else 0.95,
            'summary_intel': summary_intel,
            'dossier': dossier,
            'results': dossier,
            'investigation_id': investigation_id,
            'risk': risk_score.to_dict() if risk_score else None,
            'timeline': [e.to_dict() for e in timeline_events],
            'graph': vis_graph,
            'correlations': correlations,
            'provenance': [p.to_dict() for p in provider_results],
            'errors': errors,
            'duration_ms': duration_ms,
            'timestamp': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
        }

        return resp_data

    def _plan_investigation_tasks(self, target: str, target_type: TargetType) -> list[tuple[str, any, str]]:
        """Maps target type to list of (key, func, query_arg)."""
        tasks = []
        if target_type == TargetType.ASN:
            clean_asn = target.upper()
            tasks.append(('bgp', lookup_bgp, clean_asn))

        elif target_type == TargetType.IP:
            tasks.append(('ip', lookup_ip, target))

        elif target_type == TargetType.PHONE:
            tasks.append(('phone', lookup_phone, target))
            digits_only = ''.join(c for c in target if c.isdigit())
            if digits_only:
                tasks.append(('number', analyze_number, digits_only))
                tasks.append(('dorks', generate_dorks, digits_only))

        elif target_type == TargetType.DISCORD:
            tasks.append(('discord', lookup_discord, target))
            tasks.append(('number', analyze_number, target))

        elif target_type == TargetType.PORT:
            tasks.append(('number', analyze_number, target))
            num_val = int(target)
            if 1 <= num_val <= 400000:
                tasks.append(('bgp', lookup_bgp, f"AS{num_val}"))

        elif target_type == TargetType.NUMBER:
            tasks.append(('number', analyze_number, target))
            tasks.append(('dorks', generate_dorks, target))

        elif target_type == TargetType.EMAIL:
            tasks.append(('email', lookup_email, target))
            domain_part = target.split('@')[-1]
            tasks.append(('dorks', generate_dorks, domain_part))
            # Real breach intelligence via HIBP providers
            tasks.append(('breaches', self.hibp_breach_provider.search, target))
            tasks.append(('pastes', self.hibp_paste_provider.search, target))

        elif target_type == TargetType.HASH:
            tasks.append(('hash', analyze_hash, target))

        elif target_type == TargetType.DOMAIN:
            clean_domain = re.sub(r'^https?://', '', target).split('/')[0]
            tasks.append(('domain', lookup_domain, clean_domain))
            tasks.append(('dorks', generate_dorks, clean_domain))
            url = f"https://{clean_domain}" if not target.startswith('http') else target
            tasks.append(('headers', analyze_headers, url))

        elif target_type == TargetType.USERNAME:
            clean_user = target.lstrip('@')
            tasks.append(('username', check_username, clean_user))
            tasks.append(('dorks', generate_dorks, clean_user))

        return tasks

    def _run_task(self, key: str, func, query_arg: str) -> ProviderResult:
        """Executes a single provider or module with caching and timing."""
        start_time = time.time()
        cache_key = TTLCache.hash_key(key, query_arg)
        cached = investigation_cache.get(cache_key)

        if cached is not None:
            return ProviderResult(
                provider_name=key,
                source_url=f"cache://{key}",
                query=query_arg,
                timestamp=start_time,
                confidence=Confidence.CONFIRMED,
                data=cached,
                duration_ms=0.0
            )

        try:
            raw = func(query_arg)
            # If the function returned a ProviderResult directly (like HIBP search)
            if isinstance(raw, ProviderResult):
                return raw

            elapsed = (time.time() - start_time) * 1000
            data = raw if isinstance(raw, dict) else {'result': raw}
            investigation_cache.set(cache_key, data, ttl=3600)

            return ProviderResult(
                provider_name=key,
                source_url=f"spectre://{key}",
                query=query_arg,
                timestamp=start_time,
                confidence=Confidence.HIGH,
                data=data,
                duration_ms=round(elapsed, 2)
            )
        except Exception as e:
            elapsed = (time.time() - start_time) * 1000
            err_msg = str(e)
            err_lower = err_msg.lower()
            if "rate limit" in err_lower or "429" in err_msg:
                etype = ErrorType.RATE_LIMITED
            elif "timeout" in err_lower:
                etype = ErrorType.TIMEOUT
            elif "unauthorized" in err_lower or "401" in err_msg:
                etype = ErrorType.UNAUTHORIZED
            elif "blocked" in err_lower:
                etype = ErrorType.BLOCKED
            else:
                etype = ErrorType.PROVIDER_ERROR

            return ProviderResult(
                provider_name=key,
                source_url=f"spectre://{key}",
                query=query_arg,
                timestamp=start_time,
                confidence=Confidence.UNVERIFIED,
                error_type=etype,
                error_message=err_msg,
                duration_ms=round(elapsed, 2),
                data={}
            )

    def _execute_cascade_recon(self, target: str, target_type: TargetType, dossier: dict, provider_results: list, errors: list):
        """Cascades cross-module recon (e.g. IP -> BGP ASN, Domain -> Headers/BGP)."""
        # 1. If IP lookup returned ASN, query BGP
        if target_type == TargetType.IP and 'ip' in dossier and 'bgp' not in dossier:
            ip_data = dossier['ip']
            asn = ip_data.get('asn') or ip_data.get('as') or ''
            asn_match = re.search(r'AS\d+', asn, re.IGNORECASE)
            if asn_match:
                try:
                    bgp_res = lookup_bgp(asn_match.group(0))
                    dossier['bgp'] = bgp_res
                except Exception as e:
                    logger.debug(f"Cascade BGP lookup failed: {e}")

        # 2. If Domain lookup returned DNS A records and BGP is missing
        if target_type == TargetType.DOMAIN and 'domain' in dossier and 'bgp' not in dossier:
            dns_a = dossier['domain'].get('dns', {}).get('A', [])
            if dns_a:
                try:
                    first_ip = dns_a[0]
                    ip_res = lookup_ip(first_ip)
                    asn = ip_res.get('asn') or ip_res.get('as') or ''
                    asn_match = re.search(r'AS\d+', asn, re.IGNORECASE)
                    if asn_match:
                        bgp_res = lookup_bgp(asn_match.group(0))
                        dossier['bgp'] = bgp_res
                except Exception as e:
                    logger.debug(f"Cascade domain IP/BGP failed: {e}")

    def _build_summary_intel(self, target: str, target_type: TargetType, dossier: dict, risk_score: Optional[RiskScore]) -> dict:
        """Constructs human-friendly summary cards for the UI."""
        summary = {}

        if risk_score:
            summary['risk_score'] = risk_score.score
            summary['risk_severity'] = risk_score.severity

        if target_type == TargetType.ASN:
            bgp_res = dossier.get('bgp', {})
            summary['asn_name'] = bgp_res.get('holder', 'Unknown Carrier')
            summary['prefixes_count'] = len(bgp_res.get('prefixes', []))

        elif target_type == TargetType.IP:
            ip_res = dossier.get('ip', {})
            summary['location'] = f"{ip_res.get('city', 'Unknown')}, {ip_res.get('country', 'Unknown')}".strip(', ')
            summary['isp'] = ip_res.get('isp', ip_res.get('org', 'Unknown ISP'))

        elif target_type == TargetType.EMAIL:
            email_res = dossier.get('email', {})
            summary['mx_servers'] = email_res.get('mx_records', [])
            summary['has_gravatar'] = email_res.get('gravatar', {}).get('exists', False)
            breaches_data = dossier.get('breaches', {})
            summary['breaches_count'] = breaches_data.get('total_breaches', 0)
            summary['pastes_count'] = dossier.get('pastes', {}).get('total_pastes', 0)

        elif target_type == TargetType.DOMAIN:
            dom_res = dossier.get('domain', {})
            summary['registrar'] = dom_res.get('registrar', 'Unknown')
            summary['subdomains_count'] = len(dom_res.get('subdomains_ct', []))

        elif target_type == TargetType.USERNAME:
            user_res = dossier.get('username', {})
            summary['found_count'] = len(user_res.get('found', []))
            summary['total_checked'] = user_res.get('total_checked', 45)

        elif target_type == TargetType.PHONE:
            p_res = dossier.get('phone', {})
            summary['country'] = p_res.get('country', 'Unknown')
            summary['carrier'] = p_res.get('carrier', 'Unknown')
            summary['e164'] = p_res.get('formatted', {}).get('e164', target)

        elif target_type == TargetType.DISCORD:
            disc_res = dossier.get('discord', {})
            summary['account_age_days'] = disc_res.get('account_age_days', 0)
            summary['created_utc'] = disc_res.get('created_at', 'Unknown')

        elif target_type == TargetType.PORT:
            port_data = dossier.get('number', {}).get('port_analysis', {})
            summary['service'] = port_data.get('service', 'Standard Port')
            summary['protocol'] = port_data.get('protocol', 'TCP/UDP')
            summary['risk'] = port_data.get('risk_profile', 'Standard')

        elif target_type == TargetType.HASH:
            hash_res = dossier.get('hash', {})
            summary['possible_algos'] = hash_res.get('possible_algorithms', [])
            summary['entropy'] = hash_res.get('entropy', 0)

        return summary
