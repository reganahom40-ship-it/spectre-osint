"""
Transforms investigation results into typed graph nodes and labeled edges for Vis.js.
"""
import hashlib
from modules.models import GraphNode, GraphEdge, Confidence, TargetType

NODE_STYLES = {
    'CORE': {'color': '#00f0ff', 'size': 28, 'shape': 'diamond'},
    'EMAIL': {'color': '#ff6b6b', 'size': 18, 'shape': 'dot'},
    'BREACH': {'color': '#ff4444', 'size': 14, 'shape': 'triangle'},
    'DOMAIN': {'color': '#4ecdc4', 'size': 18, 'shape': 'dot'},
    'IP': {'color': '#45b7d1', 'size': 16, 'shape': 'dot'},
    'ASN': {'color': '#96ceb4', 'size': 16, 'shape': 'square'},
    'USERNAME': {'color': '#dda0dd', 'size': 14, 'shape': 'dot'},
    'PLATFORM': {'color': '#98d8c8', 'size': 10, 'shape': 'dot'},
    'CERTIFICATE': {'color': '#f7dc6f', 'size': 12, 'shape': 'triangle'},
    'PHONE': {'color': '#82e0aa', 'size': 16, 'shape': 'dot'},
    'HASH': {'color': '#bb8fce', 'size': 16, 'shape': 'square'},
    'MX_SERVER': {'color': '#85c1e9', 'size': 12, 'shape': 'dot'},
    'NAMESERVER': {'color': '#73c6b6', 'size': 12, 'shape': 'dot'},
}

class GraphBuilder:
    def build(self, target: str, target_type, provider_results: dict, investigation_id: str) -> tuple[list[GraphNode], list[GraphEdge]]:
        nodes = []
        edges = []
        
        core_node = self._build_core_node(target, target_type, investigation_id)
        nodes.append(core_node)
        
        if target_type == TargetType.EMAIL:
            n, e = self._build_email_graph(target, provider_results)
            nodes.extend(n)
            edges.extend(e)
        elif target_type == TargetType.DOMAIN:
            n, e = self._build_domain_graph(target, provider_results)
            nodes.extend(n)
            edges.extend(e)
        elif target_type == TargetType.IP:
            n, e = self._build_ip_graph(target, provider_results)
            nodes.extend(n)
            edges.extend(e)
        elif target_type == TargetType.USERNAME:
            n, e = self._build_username_graph(target, provider_results)
            nodes.extend(n)
            edges.extend(e)
        elif target_type == TargetType.DISCORD:
            n, e = self._build_discord_graph(target, provider_results)
            nodes.extend(n)
            edges.extend(e)
        elif target_type == TargetType.PHONE:
            n, e = self._build_phone_graph(target, provider_results)
            nodes.extend(n)
            edges.extend(e)
            
        return nodes, edges

    def _build_core_node(self, target, target_type, investigation_id) -> GraphNode:
        return GraphNode(
            id=self._node_id("CORE", target),
            label=target,
            node_type="CORE",
            metadata={"investigation_id": investigation_id, "type": str(target_type)}
        )

    def _build_email_graph(self, target, dossier) -> tuple[list, list]:
        nodes = []
        edges = []
        
        email_data = dossier.get('email') or dossier.get('lookup_email', {})
        email_id = self._node_id("CORE", target)
        
        if 'domain' in email_data and email_data['domain']:
            domain = email_data['domain']
            domain_id = self._node_id("DOMAIN", domain)
            nodes.append(GraphNode(id=domain_id, label=domain, node_type="DOMAIN"))
            edges.append(GraphEdge(source=email_id, target=domain_id, edge_type="USES_DOMAIN", label="USES_DOMAIN"))
            
            for mx_item in email_data.get('mx_records', []):
                mx_server = mx_item.get('server', str(mx_item)).rstrip('.') if isinstance(mx_item, dict) else str(mx_item).rstrip('.')
                mx_id = self._node_id("MX_SERVER", mx_server)
                nodes.append(GraphNode(id=mx_id, label=mx_server, node_type="MX_SERVER"))
                edges.append(GraphEdge(source=domain_id, target=mx_id, edge_type="ROUTES_MAIL", label="ROUTES_MAIL"))
                
        breach_data = dossier.get('breaches') or dossier.get('check_breaches', {})
        if breach_data and isinstance(breach_data, dict):
            for breach in breach_data.get('breaches', []):
                name = breach.get('name', 'Unknown') if isinstance(breach, dict) else getattr(breach, 'name', 'Unknown')
                b_id = self._node_id("BREACH", name)
                nodes.append(GraphNode(id=b_id, label=name, node_type="BREACH"))
                edges.append(GraphEdge(source=email_id, target=b_id, edge_type="EXPOSED_IN", label="EXPOSED_IN"))
                
        return nodes, edges

    def _build_domain_graph(self, target, dossier) -> tuple[list, list]:
        nodes = []
        edges = []
        
        domain_data = dossier.get('domain') or dossier.get('lookup_domain', {})
        domain_id = self._node_id("CORE", target)
        
        if 'dns' in domain_data and isinstance(domain_data['dns'], dict):
            for ip in domain_data['dns'].get('A', []):
                ip_id = self._node_id("IP", ip)
                nodes.append(GraphNode(id=ip_id, label=ip, node_type="IP"))
                edges.append(GraphEdge(source=domain_id, target=ip_id, edge_type="RESOLVED_TO", label="RESOLVED_TO"))
                
            for ns in domain_data['dns'].get('NS', []):
                ns_clean = str(ns).rstrip('.')
                ns_id = self._node_id("NAMESERVER", ns_clean)
                nodes.append(GraphNode(id=ns_id, label=ns_clean, node_type="NAMESERVER"))
                edges.append(GraphEdge(source=domain_id, target=ns_id, edge_type="DELEGATED_TO", label="DELEGATED_TO"))
                
        bgp_data = dossier.get('bgp') or dossier.get('lookup_bgp', {})
        if 'asn' in bgp_data:
            asn = str(bgp_data['asn'])
            asn_id = self._node_id("ASN", asn)
            nodes.append(GraphNode(id=asn_id, label=f"AS{asn}", node_type="ASN"))
            if 'dns' in domain_data and isinstance(domain_data['dns'], dict):
                for ip in domain_data['dns'].get('A', []):
                    ip_id = self._node_id("IP", ip)
                    edges.append(GraphEdge(source=ip_id, target=asn_id, edge_type="ANNOUNCED_BY", label="ANNOUNCED_BY"))
                    
        if 'ssl' in domain_data and isinstance(domain_data['ssl'], dict):
            issuer = domain_data['ssl'].get('issuer', 'Unknown')
            if issuer:
                cert_id = self._node_id("CERTIFICATE", issuer)
                nodes.append(GraphNode(id=cert_id, label=f"Cert: {issuer}", node_type="CERTIFICATE"))
                edges.append(GraphEdge(source=domain_id, target=cert_id, edge_type="ISSUED_FOR", label="ISSUED_FOR"))
            
        subs = domain_data.get('subdomains_ct') or domain_data.get('subdomains', [])
        if subs:
            for sub in subs[:10]:
                sub_id = self._node_id("DOMAIN", sub)
                nodes.append(GraphNode(id=sub_id, label=sub, node_type="DOMAIN"))
                edges.append(GraphEdge(source=sub_id, target=domain_id, edge_type="SUBDOMAIN_OF", label="SUBDOMAIN_OF"))
                
        return nodes, edges

    def _build_ip_graph(self, target, dossier) -> tuple[list, list]:
        nodes = []
        edges = []
        ip_id = self._node_id("CORE", target)
        
        bgp_data = dossier.get('bgp') or dossier.get('lookup_bgp', {})
        if 'asn' in bgp_data:
            asn = str(bgp_data['asn'])
            asn_id = self._node_id("ASN", asn)
            nodes.append(GraphNode(id=asn_id, label=f"AS{asn}", node_type="ASN"))
            edges.append(GraphEdge(source=ip_id, target=asn_id, edge_type="ANNOUNCED_BY", label="ANNOUNCED_BY"))
            
        return nodes, edges

    def _build_username_graph(self, target, dossier) -> tuple[list, list]:
        nodes = []
        edges = []
        user_id = self._node_id("CORE", target)
        
        user_data = dossier.get('username') or dossier.get('check_username', {})
        found = user_data.get('found', [])[:15]
        for p in found:
            plat_name = p.get('platform', str(p)) if isinstance(p, dict) else str(p)
            p_id = self._node_id("PLATFORM", plat_name)
            nodes.append(GraphNode(id=p_id, label=plat_name, node_type="PLATFORM"))
            edges.append(GraphEdge(source=user_id, target=p_id, edge_type="FOUND_ON", label="FOUND_ON"))
            
        return nodes, edges

    def _build_discord_graph(self, target, dossier) -> tuple[list, list]:
        nodes = []
        edges = []
        core_id = self._node_id("CORE", target)
        disc_data = dossier.get('discord') or dossier.get('lookup_discord', {})
        if disc_data:
            uname = disc_data.get('username') or disc_data.get('global_name')
            if uname:
                u_id = self._node_id("USERNAME", uname)
                nodes.append(GraphNode(id=u_id, label=uname, node_type="USERNAME"))
                edges.append(GraphEdge(source=core_id, target=u_id, edge_type="DISCORD_USER", label="HANDLE"))
            created = disc_data.get('created_at')
            if created:
                e_id = self._node_id("CERTIFICATE", created)
                nodes.append(GraphNode(id=e_id, label=f"Epoch: {created[:10]}", node_type="CERTIFICATE"))
                edges.append(GraphEdge(source=core_id, target=e_id, edge_type="EPOCH_DECODED", label="CREATED_UTC"))
        return nodes, edges
        
    def _build_phone_graph(self, target, dossier) -> tuple[list, list]:
        nodes = []
        edges = []
        core_id = self._node_id("CORE", target)
        phone_data = dossier.get('phone') or dossier.get('lookup_phone', {})
        if phone_data:
            carrier = phone_data.get('carrier')
            if carrier and carrier != 'Unknown':
                c_id = self._node_id("ASN", carrier)
                nodes.append(GraphNode(id=c_id, label=carrier, node_type="ASN"))
                edges.append(GraphEdge(source=core_id, target=c_id, edge_type="CARRIER", label="CARRIER"))
            country = phone_data.get('country')
            if country and country != 'Unknown':
                g_id = self._node_id("PLATFORM", country)
                nodes.append(GraphNode(id=g_id, label=country, node_type="PLATFORM"))
                edges.append(GraphEdge(source=core_id, target=g_id, edge_type="LOCATION", label="REGION"))
        return nodes, edges

    def _node_id(self, prefix, value) -> str:
        h = hashlib.sha256(str(value).encode()).hexdigest()[:8]
        return f"{prefix}_{h}"

    def to_vis_json(self, nodes: list[GraphNode], edges: list[GraphEdge]) -> dict:
        vis_nodes = []
        for n in nodes:
            style = NODE_STYLES.get(n.node_type, {})
            vis_nodes.append({
                "id": n.id,
                "label": n.label,
                "color": style.get("color", "#cccccc"),
                "size": style.get("size", 14),
                "shape": style.get("shape", "dot"),
                "title": f"Type: {n.node_type}",
                "group": n.node_type
            })
            
        vis_edges = []
        for e in edges:
            vis_edges.append({
                "from": e.source,
                "to": e.target,
                "label": e.label,
                "color": {"color": "rgba(100,100,100,0.5)"},
                "arrows": "to"
            })
            
        return {"nodes": vis_nodes, "edges": vis_edges}
