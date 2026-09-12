import ipaddress
import socket
import requests

def lookup_ip(ip_address: str) -> dict:
    try:
        ip_obj = ipaddress.ip_address(ip_address)
    except ValueError:
        raise ValueError(f"Invalid IP address: {ip_address}")

    if ip_obj.is_private or ip_obj.is_loopback or ip_obj.is_reserved or ip_obj.is_link_local or ip_obj.is_multicast:
        raise ValueError('Blocked: cannot look up private/reserved IP addresses')

    api_url = f"http://ip-api.com/json/{ip_address}?fields=status,message,continent,country,countryCode,region,regionName,city,zip,lat,lon,timezone,offset,currency,isp,org,as,asname,reverse,mobile,proxy,hosting,query"
    
    try:
        response = requests.get(api_url, timeout=5)
        response.raise_for_status()
        data = response.json()
    except Exception as e:
        raise RuntimeError(f"Error querying ip-api: {str(e)}")

    if data.get('status') == 'fail':
        raise ValueError(data.get('message', 'ip-api lookup failed'))

    reverse_dns = None
    try:
        default_timeout = socket.getdefaulttimeout()
        socket.setdefaulttimeout(3)
        host, _, _ = socket.gethostbyaddr(ip_address)
        reverse_dns = host
        socket.setdefaulttimeout(default_timeout)
    except Exception:
        pass

    data['reverse_dns'] = reverse_dns
    return data
