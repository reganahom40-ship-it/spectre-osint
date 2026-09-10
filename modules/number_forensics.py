import datetime
import socket
import struct

COMMON_PORTS = {
    20: {'service': 'FTP Data', 'proto': 'TCP', 'desc': 'File Transfer Protocol (Data Channel)', 'risk': 'Medium'},
    21: {'service': 'FTP Control', 'proto': 'TCP', 'desc': 'File Transfer Protocol (Command/Auth)', 'risk': 'High - Cleartext Auth'},
    22: {'service': 'SSH', 'proto': 'TCP', 'desc': 'Secure Shell Remote Access', 'risk': 'High Target for Brute-force'},
    23: {'service': 'Telnet', 'proto': 'TCP', 'desc': 'Unencrypted Remote Terminal', 'risk': 'Critical - Legacy Cleartext'},
    25: {'service': 'SMTP', 'proto': 'TCP', 'desc': 'Simple Mail Transfer Protocol', 'risk': 'Medium - Open Relay Risk'},
    53: {'service': 'DNS', 'proto': 'UDP/TCP', 'desc': 'Domain Name System Resolution', 'risk': 'Medium - Zone Transfer / Amplification'},
    67: {'service': 'DHCP Server', 'proto': 'UDP', 'desc': 'Dynamic Host Configuration Protocol', 'risk': 'Medium'},
    68: {'service': 'DHCP Client', 'proto': 'UDP', 'desc': 'DHCP Client Broadcast', 'risk': 'Low'},
    69: {'service': 'TFTP', 'proto': 'UDP', 'desc': 'Trivial File Transfer Protocol', 'risk': 'High - No Authentication'},
    80: {'service': 'HTTP', 'proto': 'TCP', 'desc': 'World Wide Web HyperText Transfer', 'risk': 'Standard Web Traffic'},
    88: {'service': 'Kerberos', 'proto': 'TCP/UDP', 'desc': 'Active Directory Kerberos Auth', 'risk': 'High - Golden Ticket / AS-REP Roasting'},
    110: {'service': 'POP3', 'proto': 'TCP', 'desc': 'Post Office Protocol Mail', 'risk': 'Medium'},
    123: {'service': 'NTP', 'proto': 'UDP', 'desc': 'Network Time Protocol', 'risk': 'Low - NTP Amplification Risk'},
    135: {'service': 'MS RPC', 'proto': 'TCP', 'desc': 'Microsoft Remote Procedure Call (EPMAP)', 'risk': 'High - Exploitation Vector'},
    137: {'service': 'NetBIOS-NS', 'proto': 'UDP', 'desc': 'NetBIOS Name Service', 'risk': 'Medium - Network Poisoning (Responder)'},
    139: {'service': 'NetBIOS-SSN', 'proto': 'TCP', 'desc': 'NetBIOS Session Service', 'risk': 'Medium'},
    143: {'service': 'IMAP', 'proto': 'TCP', 'desc': 'Internet Message Access Protocol', 'risk': 'Medium'},
    161: {'service': 'SNMP', 'proto': 'UDP', 'desc': 'Simple Network Management Protocol', 'risk': 'High - Default Community Strings'},
    389: {'service': 'LDAP', 'proto': 'TCP/UDP', 'desc': 'Lightweight Directory Access Protocol', 'risk': 'High - AD Reconnaissance'},
    443: {'service': 'HTTPS', 'proto': 'TCP', 'desc': 'HTTP over TLS/SSL Encryption', 'risk': 'Standard Encrypted Web'},
    445: {'service': 'SMB', 'proto': 'TCP', 'desc': 'Server Message Block (Windows File Sharing)', 'risk': 'Critical - EternalBlue / Relay Attacks'},
    465: {'service': 'SMTPS', 'proto': 'TCP', 'desc': 'Authenticated SMTP over TLS', 'risk': 'Low'},
    587: {'service': 'SMTP Submission', 'proto': 'TCP', 'desc': 'Mail Submission Protocol', 'risk': 'Low'},
    636: {'service': 'LDAPS', 'proto': 'TCP', 'desc': 'Secure LDAP over TLS', 'risk': 'Medium'},
    993: {'service': 'IMAPS', 'proto': 'TCP', 'desc': 'Secure IMAP over TLS', 'risk': 'Low'},
    995: {'service': 'POP3S', 'proto': 'TCP', 'desc': 'Secure POP3 over TLS', 'risk': 'Low'},
    1433: {'service': 'MS SQL Server', 'proto': 'TCP', 'desc': 'Microsoft SQL Relational Database', 'risk': 'High - Database Target'},
    1521: {'service': 'Oracle DB', 'proto': 'TCP', 'desc': 'Oracle Database Listener (TNS)', 'risk': 'High'},
    2049: {'service': 'NFS', 'proto': 'TCP/UDP', 'desc': 'Network File System Shares', 'risk': 'High - Misconfigured Export Paths'},
    3306: {'service': 'MySQL / MariaDB', 'proto': 'TCP', 'desc': 'MySQL Relational Database', 'risk': 'High - Default Credential Scans'},
    3389: {'service': 'RDP', 'proto': 'TCP/UDP', 'desc': 'Remote Desktop Protocol (Windows GUI)', 'risk': 'Critical - BlueKeep / Ransomware Vector'},
    5000: {'service': 'Flask / UPnP / Dev', 'proto': 'TCP', 'desc': 'Common Python Web / Docker Development Server', 'risk': 'Medium - Dev Server Exposure'},
    5432: {'service': 'PostgreSQL', 'proto': 'TCP', 'desc': 'PostgreSQL Relational Database', 'risk': 'High'},
    5900: {'service': 'VNC Server', 'proto': 'TCP', 'desc': 'Virtual Network Computing Remote Desktop', 'risk': 'High - Weak Password Risk'},
    6379: {'service': 'Redis', 'proto': 'TCP', 'desc': 'Redis In-Memory Key-Value Cache', 'risk': 'Critical - Unauthenticated RCE Risk'},
    8000: {'service': 'HTTP Alt / Django', 'proto': 'TCP', 'desc': 'Alternative Web / Python Dev Server', 'risk': 'Medium'},
    8080: {'service': 'HTTP Proxy / Tomcat', 'proto': 'TCP', 'desc': 'Common Web Proxy / Apache Tomcat / Spring Boot', 'risk': 'High - Admin Panels'},
    8443: {'service': 'HTTPS Alt', 'proto': 'TCP', 'desc': 'Alternative Secure Web Management Console', 'risk': 'Medium'},
    8888: {'service': 'Jupyter / Web', 'proto': 'TCP', 'desc': 'Jupyter Notebook / Web Application Alt', 'risk': 'High - Unauthenticated Notebooks'},
    9000: {'service': 'Portainer / SonarQube', 'proto': 'TCP', 'desc': 'Docker Management / DevOps Console', 'risk': 'High'},
    9200: {'service': 'Elasticsearch', 'proto': 'TCP', 'desc': 'Elasticsearch RESTful Search Cluster', 'risk': 'Critical - Open Cluster Data Leaks'},
    27017: {'service': 'MongoDB', 'proto': 'TCP', 'desc': 'MongoDB NoSQL Document Database', 'risk': 'Critical - Unauthenticated DB Leaks'},
    25565: {'service': 'Minecraft', 'proto': 'TCP/UDP', 'desc': 'Minecraft Game Server Protocol', 'risk': 'Low - Log4j Historical Vector'}
}

def analyze_number(val_str: str) -> dict:
    val_str = str(val_str).strip()
    digits_only = ''.join(c for c in val_str if c.isdigit())
    if not digits_only:
        return {'valid': False, 'error': 'No numeric digits found'}
    
    num_val = int(digits_only)
    digit_len = len(digits_only)
    
    res = {
        'valid': True,
        'raw_input': val_str,
        'integer_value': num_val,
        'digit_count': digit_len,
        'encodings': {
            'hex': hex(num_val),
            'octal': oct(num_val),
            'binary': bin(num_val),
            'bit_length': num_val.bit_length(),
            'byte_length': (num_val.bit_length() + 7) // 8
        },
        'port_analysis': None,
        'ipv4_decimal': None,
        'timestamp_epoch': None,
        'discord_snowflake': None,
        'asn_candidate': None,
        'pivots': []
    }
    
    if 1 <= num_val <= 65535:
        p_info = COMMON_PORTS.get(num_val, {
            'service': f'Unassigned / Dynamic Port {num_val}',
            'proto': 'TCP/UDP',
            'desc': 'User / Dynamic Socket Range' if num_val > 1024 else 'Standard IANA Registered Port',
            'risk': 'Standard Service'
        })
        res['port_analysis'] = {
            'port': num_val,
            'service': p_info['service'],
            'protocol': p_info['proto'],
            'description': p_info['desc'],
            'risk_profile': p_info['risk'],
            'nmap_command': f'nmap -p {num_val} -sV -sC -Pn <target>',
            'shodan_dork': f'port:{num_val}',
            'shodan_url': f'https://www.shodan.io/search?query=port%3A{num_val}'
        }
    
    if 0 <= num_val <= 4294967295 and digit_len >= 4:
        try:
            ip_str = socket.inet_ntoa(struct.pack('!I', num_val))
            res['ipv4_decimal'] = {
                'decimal_integer': num_val,
                'resolved_ip': ip_str,
                'virustotal_url': f'https://www.virustotal.com/gui/ip-address/{ip_str}',
                'shodan_url': f'https://www.shodan.io/host/{ip_str}'
            }
        except Exception:
            pass

    if 946684800 <= num_val <= 2524608000:
        try:
            dt = datetime.datetime.utcfromtimestamp(num_val)
            now = datetime.datetime.utcnow()
            diff_days = (now - dt).days
            res['timestamp_epoch'] = {
                'epoch_seconds': num_val,
                'utc_datetime': dt.strftime('%Y-%m-%d %H:%M:%S UTC'),
                'iso_8601': dt.isoformat() + 'Z',
                'relative_time': f'{abs(diff_days)} days ago' if diff_days >= 0 else f'in {abs(diff_days)} days'
            }
        except Exception:
            pass

    if 15 <= digit_len <= 20:
        try:
            unix_ms = (num_val >> 22) + 1420070400000
            dt = datetime.datetime.utcfromtimestamp(unix_ms / 1000.0)
            now = datetime.datetime.utcnow()
            age_days = (now - dt).days
            worker_id = (num_val & 0x3E0000) >> 17
            process_id = (num_val & 0x1F000) >> 12
            increment = num_val & 0xFFF
            res['discord_snowflake'] = {
                'snowflake': str(num_val),
                'valid': True,
                'timestamp_utc': dt.strftime('%Y-%m-%d %H:%M:%S UTC'),
                'unix_timestamp': int(unix_ms / 1000.0),
                'age_days': max(0, age_days),
                'worker_id': worker_id,
                'process_id': process_id,
                'increment': increment
            }
        except Exception:
            pass

    if 1 <= num_val <= 400000 and digit_len >= 2:
        res['asn_candidate'] = {
            'asn': f'AS{num_val}',
            'bgp_he_url': f'https://bgp.he.net/AS{num_val}',
            'ripe_stat_url': f'https://stat.ripe.net/app/launchpad/AS{num_val}'
        }

    res['pivots'] = [
        {'name': 'Google Search', 'url': f'https://www.google.com/search?q=%22{val_str}%22'},
        {'name': 'GitHub Code Search', 'url': f'https://github.com/search?q={val_str}&type=code'},
        {'name': 'Shodan Search', 'url': f'https://www.shodan.io/search?query={val_str}'},
        {'name': 'VirusTotal Intelligence', 'url': f'https://www.virustotal.com/gui/search/{val_str}'},
        {'name': 'NumLookup Carrier', 'url': f'https://www.numlookup.com/search?number={digits_only}'}
    ]
    
    return res
