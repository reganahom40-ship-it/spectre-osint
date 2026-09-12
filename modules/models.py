"""
Data models for the SPECTRE OSINT intelligence platform.
"""
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Optional
import time

class Confidence(Enum):
    CONFIRMED = 1.0
    HIGH = 0.85
    MEDIUM = 0.65
    LOW = 0.4
    UNVERIFIED = 0.1

class ErrorType(Enum):
    NONE = "NONE"
    NO_RESULTS = "NO_RESULTS"
    PROVIDER_ERROR = "PROVIDER_ERROR"
    RATE_LIMITED = "RATE_LIMITED"
    UNAUTHORIZED = "UNAUTHORIZED"
    TIMEOUT = "TIMEOUT"
    BLOCKED = "BLOCKED"

class TargetType(Enum):
    EMAIL = "EMAIL"
    IP = "IP"
    DOMAIN = "DOMAIN"
    USERNAME = "USERNAME"
    PHONE = "PHONE"
    DISCORD = "DISCORD"
    HASH = "HASH"
    ASN = "ASN"
    PORT = "PORT"
    NUMBER = "NUMBER"
    UNKNOWN = "UNKNOWN"

@dataclass
class TargetClassification:
    target: str
    target_type: TargetType
    confidence: Confidence
    schema_info: str

    def to_dict(self):
        return {
            "target": self.target,
            "target_type": self.target_type.name,
            "confidence": self.confidence.name,
            "schema_info": self.schema_info
        }

@dataclass
class ProviderResult:
    provider_name: str
    source_url: str
    query: str
    timestamp: float
    confidence: Confidence
    error_type: ErrorType = ErrorType.NONE
    error_message: str = ''
    duration_ms: float = 0.0
    data: dict = field(default_factory=dict)
    raw_data: Any = None

    def to_dict(self):
        return {
            "provider_name": self.provider_name,
            "source_url": self.source_url,
            "query": self.query,
            "timestamp": self.timestamp,
            "confidence": self.confidence.name,
            "error_type": self.error_type.name,
            "error_message": self.error_message,
            "duration_ms": self.duration_ms,
            "data": self.data,
            "raw_data": self.raw_data
        }

@dataclass
class TimelineEvent:
    timestamp: str
    source_module: str
    event_type: str
    title: str
    description: str
    confidence: Confidence
    evidence: str = ''

    def to_dict(self):
        return {
            "timestamp": self.timestamp,
            "source_module": self.source_module,
            "event_type": self.event_type,
            "title": self.title,
            "description": self.description,
            "confidence": self.confidence.name,
            "evidence": self.evidence
        }

@dataclass
class GraphNode:
    id: str
    label: str
    node_type: str
    metadata: dict = field(default_factory=dict)

    def to_dict(self):
        return {
            "id": self.id,
            "label": self.label,
            "node_type": self.node_type,
            "metadata": self.metadata
        }

@dataclass
class GraphEdge:
    source: str
    target: str
    edge_type: str
    label: str = ''
    confidence: Confidence = Confidence.HIGH

    def to_dict(self):
        return {
            "source": self.source,
            "target": self.target,
            "edge_type": self.edge_type,
            "label": self.label,
            "confidence": self.confidence.name
        }

@dataclass
class RiskScore:
    score: int
    severity: str
    factors: list = field(default_factory=list)
    summary: str = ''

    def to_dict(self):
        return {
            "score": self.score,
            "severity": self.severity,
            "factors": self.factors,
            "summary": self.summary
        }

@dataclass
class InvestigationResult:
    investigation_id: str
    target: TargetClassification
    risk: Optional[RiskScore] = None
    provider_results: list[ProviderResult] = field(default_factory=list)
    timeline: list[TimelineEvent] = field(default_factory=list)
    graph_nodes: list[GraphNode] = field(default_factory=list)
    graph_edges: list[GraphEdge] = field(default_factory=list)
    correlations: list[dict] = field(default_factory=list)
    errors: list[dict] = field(default_factory=list)
    duration_ms: float = 0.0
    timestamp: str = ''

    def to_dict(self):
        return {
            "investigation_id": self.investigation_id,
            "target": self.target.to_dict(),
            "risk": self.risk.to_dict() if self.risk else None,
            "provider_results": [p.to_dict() for p in self.provider_results],
            "timeline": [t.to_dict() for t in self.timeline],
            "graph_nodes": [g.to_dict() for g in self.graph_nodes],
            "graph_edges": [g.to_dict() for g in self.graph_edges],
            "correlations": self.correlations,
            "errors": self.errors,
            "duration_ms": self.duration_ms,
            "timestamp": self.timestamp
        }

    def to_api_response(self):
        # Build backwards compatible dossier and summary intel
        dossier = {}
        for result in self.provider_results:
            dossier[result.provider_name] = result.data

        summary_intel = {}
        if self.target.target_type == TargetType.IP:
            ip_data = dossier.get("lookup_ip", {})
            if isinstance(ip_data, dict):
                city = ip_data.get("city", "")
                country = ip_data.get("country", "")
                if city or country:
                    summary_intel["location"] = f"{city}, {country}".strip(", ")
                if "org" in ip_data:
                    summary_intel["isp"] = ip_data.get("org", "")
        elif self.target.target_type == TargetType.DOMAIN:
            domain_data = dossier.get("lookup_domain", {})
            if isinstance(domain_data, dict):
                if "registrar" in domain_data:
                    summary_intel["registrar"] = domain_data.get("registrar", "")
                if "creation_date" in domain_data:
                    summary_intel["creation_date"] = domain_data.get("creation_date", "")

        return {
            # Backward compatibility fields
            "detected_type": self.target.target_type.name.lower(),
            "schema_info": self.target.schema_info,
            "confidence": self.target.confidence.name,
            "summary_intel": summary_intel,
            "dossier": dossier,
            "results": dossier,
            # New fields
            "investigation_id": self.investigation_id,
            "risk": self.risk.to_dict() if self.risk else None,
            "timeline": [t.to_dict() for t in self.timeline],
            "graph": {
                "nodes": [g.to_dict() for g in self.graph_nodes],
                "edges": [g.to_dict() for g in self.graph_edges]
            },
            "correlations": self.correlations,
            "provenance": [p.to_dict() for p in self.provider_results],
            "errors": self.errors,
            "duration_ms": self.duration_ms,
            "timestamp": self.timestamp
        }
