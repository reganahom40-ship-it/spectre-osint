from flask import Flask, request, jsonify, render_template
import datetime
import re

from modules.username import check_username
from modules.ip_lookup import lookup_ip
from modules.email_lookup import lookup_email
from modules.domain_lookup import lookup_domain
from modules.phone_lookup import lookup_phone
from modules.headers import analyze_headers
from modules.discord_lookup import lookup_discord
from modules.hash_lookup import analyze_hash
from modules.dork_generator import generate_dorks
from modules.bgp_lookup import lookup_bgp
from modules.number_forensics import analyze_number

app = Flask(__name__, static_folder='static', template_folder='templates')

@app.after_request
def add_cors_headers(response):
    response.headers['Access-Control-Allow-Origin'] = '*'
    response.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization'
    response.headers['Access-Control-Allow-Methods'] = 'POST, GET, OPTIONS'
    response.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate, max-age=0'
    response.headers['Pragma'] = 'no-cache'
    response.headers['Expires'] = '0'
    return response

def get_param(key):
    if request.method == 'GET':
        return str(request.args.get(key, '')).strip()
    json_data = request.get_json(silent=True) or {}
    val = json_data.get(key)
    if val is None:
        val = request.form.get(key, '')
    return str(val).strip()

def make_response_json(success, module, query, data=None, error=None):
    return jsonify({
        'success': success,
        'module': module,
        'query': query,
        'data': data,
        'error': error,
        'timestamp': datetime.datetime.utcnow().isoformat() + 'Z'
    })

@app.route('/', methods=['GET'])
def index():
    return render_template('index.html')

@app.route('/health', methods=['GET'])
def health():
    return jsonify({'status': 'operational', 'timestamp': datetime.datetime.utcnow().isoformat() + 'Z'}), 200

# =========================================================================
# OMNI-RECON AUTO-DETECTION ENGINE
# =========================================================================
@app.route('/api/omni', methods=['GET', 'POST', 'OPTIONS'])
def api_omni():
    if request.method == 'OPTIONS':
        return '', 204
    target = get_param('target') or get_param('q') or get_param('query')
    if not target:
        return make_response_json(False, 'omni', '', error='Missing target query string'), 400

    target = target.strip()
    detected_type = 'username'
    confidence = 0.95
    schema_info = 'Alphanumeric Username / Handle'
    summary_intel = {}
    dossier = {}

    digits_only = ''.join(c for c in target if c.isdigit())
    is_pure_digits = target.isdigit()

    # 1. ASN Check (e.g. AS15169 or AS13335)
    if re.match(r'^AS\d+$', target, re.IGNORECASE):
        detected_type = 'asn'
        schema_info = 'Autonomous System Number (BGP)'
        confidence = 0.99
        try:
            bgp_res = lookup_bgp(target.upper())
            dossier['bgp'] = bgp_res
            summary_intel['asn_name'] = bgp_res.get('holder', 'Unknown Carrier')
            summary_intel['prefixes_count'] = len(bgp_res.get('prefixes', []))
        except Exception as e:
            dossier['bgp_error'] = str(e)

    # 2. IPv4 Address Check (e.g. 1.1.1.1 or 192.168.1.1)
    elif re.match(r'^(\d{1,3}\.){3}\d{1,3}$', target):
        detected_type = 'ip'
        schema_info = 'IPv4 Global Unicast Address'
        confidence = 0.99
        try:
            ip_res = lookup_ip(target)
            dossier['ip'] = ip_res
            summary_intel['location'] = f"{ip_res.get('city', 'Unknown')}, {ip_res.get('country', 'Unknown')}"
            summary_intel['isp'] = ip_res.get('isp', ip_res.get('org', 'Unknown ISP'))
            
            asn = ip_res.get('asn') or ip_res.get('as') or ''
            asn_match = re.search(r'AS\d+', asn, re.IGNORECASE)
            if asn_match:
                try:
                    bgp_data = lookup_bgp(asn_match.group(0))
                    dossier['bgp'] = bgp_data
                except Exception:
                    pass
        except Exception as e:
            dossier['ip_error'] = str(e)

    # 3. Pure Numbers & Integer Intelligence (Ports, Phones, Epochs, Snowflakes, Math)
    elif is_pure_digits:
        num_val = int(target)
        digit_len = len(target)
        num_forensics = analyze_number(target)
        dossier['number'] = num_forensics

        # Discord Snowflake check (15 - 20 digits)
        if 15 <= digit_len <= 20:
            detected_type = 'discord'
            schema_info = '64-Bit Discord/Twitter Snowflake Timestamp'
            confidence = 0.99
            try:
                disc_res = lookup_discord(target)
                dossier['discord'] = disc_res
                summary_intel['account_age_days'] = disc_res.get('age_days', 0)
                summary_intel['created_utc'] = disc_res.get('timestamp_utc', 'Unknown')
            except Exception as e:
                dossier['discord_error'] = str(e)

        # Phone Number Check (7 to 14 digits)
        elif 7 <= digit_len <= 14:
            detected_type = 'phone'
            schema_info = f'Global Telephone Number ({digit_len} Digits)'
            confidence = 0.95
            try:
                p_res = lookup_phone(target)
                dossier['phone'] = p_res
                summary_intel['country'] = p_res.get('country', 'Unknown')
                summary_intel['carrier'] = p_res.get('carrier', 'Unknown')
                summary_intel['e164'] = p_res.get('formatted', {}).get('e164', target)
            except Exception as e:
                dossier['phone_error'] = str(e)

        # Port Check (1 - 65535)
        elif 1 <= num_val <= 65535 and digit_len <= 5:
            detected_type = 'port'
            port_data = num_forensics.get('port_analysis', {})
            schema_info = f"IANA Port {num_val} ({port_data.get('service', 'Service')})"
            confidence = 0.98
            summary_intel['service'] = port_data.get('service', 'Standard Port')
            summary_intel['protocol'] = port_data.get('protocol', 'TCP/UDP')
            summary_intel['risk'] = port_data.get('risk_profile', 'Standard')
            
            # If valid ASN candidate, check BGP too
            if 1 <= num_val <= 400000:
                try:
                    dossier['bgp'] = lookup_bgp(f'AS{num_val}')
                except Exception:
                    pass

        # General Big Integer / Decimal IP / Unix Epoch
        else:
            detected_type = 'number'
            schema_info = f'Numeric Identifier ({digit_len} Digits / {num_val.bit_length()} Bits)'
            confidence = 0.95
            summary_intel['hex'] = hex(num_val)
            summary_intel['bit_length'] = num_val.bit_length()
            if num_forensics.get('ipv4_decimal'):
                summary_intel['decimal_ipv4'] = num_forensics['ipv4_decimal']['resolved_ip']
            if num_forensics.get('timestamp_epoch'):
                summary_intel['epoch_utc'] = num_forensics['timestamp_epoch']['utc_datetime']

        # Dorks & pivots
        try:
            dossier['dorks'] = generate_dorks(target)
        except Exception:
            pass

    # 4. Formatted Phone Number (+, -, (), spaces)
    elif target.startswith('+') or (re.match(r'^\+?[\d\s\-\(\)\.]{7,25}$', target) and len(digits_only) >= 7):
        detected_type = 'phone'
        schema_info = 'ITU-T E.164 Formatted Telephone Number'
        confidence = 0.97
        try:
            p_res = lookup_phone(target)
            dossier['phone'] = p_res
            dossier['number'] = analyze_number(digits_only)
            summary_intel['country'] = p_res.get('country', 'Unknown')
            summary_intel['carrier'] = p_res.get('carrier', 'Unknown')
            summary_intel['e164'] = p_res.get('formatted', {}).get('e164', target)
        except Exception as e:
            dossier['phone_error'] = str(e)
        try:
            dossier['dorks'] = generate_dorks(digits_only)
        except Exception:
            pass

    # 5. Email Address Check
    elif '@' in target and '.' in target:
        detected_type = 'email'
        schema_info = 'RFC 5322 Standard Email Address'
        confidence = 0.98
        try:
            email_res = lookup_email(target)
            dossier['email'] = email_res
            summary_intel['mx_servers'] = email_res.get('mx_records', [])
            summary_intel['has_gravatar'] = email_res.get('gravatar_exists', False)
        except Exception as e:
            dossier['email_error'] = str(e)
        domain_part = target.split('@')[-1]
        try:
            dossier['domain'] = lookup_domain(domain_part)
            dossier['dorks'] = generate_dorks(domain_part)
        except Exception:
            pass

    # 6. Cryptographic Hash Check
    elif re.match(r'^[a-fA-F0-9]{32}$|^[a-fA-F0-9]{40}$|^[a-fA-F0-9]{64}$', target):
        detected_type = 'hash'
        schema_info = 'Hexadecimal Digest / Cryptographic Checksum'
        confidence = 0.99
        try:
            hash_res = analyze_hash(target)
            dossier['hash'] = hash_res
            summary_intel['possible_algos'] = hash_res.get('possible_algorithms', [])
            summary_intel['entropy'] = hash_res.get('entropy', 0)
        except Exception as e:
            dossier['hash_error'] = str(e)

    # 7. Domain / URL Check
    elif '.' in target and not target.startswith('+') and not ' ' in target:
        detected_type = 'domain'
        schema_info = 'Fully Qualified Domain Name (FQDN)'
        confidence = 0.97
        clean_domain = re.sub(r'^https?://', '', target).split('/')[0]
        try:
            dom_res = lookup_domain(clean_domain)
            dossier['domain'] = dom_res
            summary_intel['registrar'] = dom_res.get('registrar', 'Unknown')
            summary_intel['subdomains_count'] = len(dom_res.get('subdomains_ct', []))
        except Exception as e:
            dossier['domain_error'] = str(e)
        try:
            dossier['dorks'] = generate_dorks(clean_domain)
        except Exception:
            pass
        try:
            url = f"https://{clean_domain}" if not target.startswith('http') else target
            dossier['headers'] = analyze_headers(url)
        except Exception:
            pass

    # 8. Username Discovery Default
    else:
        detected_type = 'username'
        clean_user = target.lstrip('@')
        schema_info = f'Social / Web Handle (@{clean_user})'
        confidence = 0.95
        try:
            user_res = check_username(clean_user)
            dossier['username'] = user_res
            summary_intel['found_count'] = len(user_res.get('found', []))
            summary_intel['total_checked'] = user_res.get('total_checked', 112)
        except Exception as e:
            dossier['username_error'] = str(e)
        try:
            dossier['dorks'] = generate_dorks(clean_user)
        except Exception:
            pass

    resp_data = {
        'detected_type': detected_type,
        'schema_info': schema_info,
        'confidence': confidence,
        'summary_intel': summary_intel,
        'dossier': dossier,
        'results': dossier
    }

    return jsonify({
        'success': True,
        'module': 'omni',
        'query': target,
        'data': resp_data,
        'detected_type': detected_type,
        'schema_info': schema_info,
        'confidence': confidence,
        'summary_intel': summary_intel,
        'results': dossier,
        'timestamp': datetime.datetime.utcnow().isoformat() + 'Z'
    }), 200

# =========================================================================
# DEDICATED INDIVIDUAL API ROUTES
# =========================================================================
@app.route('/api/number', methods=['GET', 'POST', 'OPTIONS'])
def api_number():
    if request.method == 'OPTIONS':
        return '', 204
    number_query = get_param('number') or get_param('target') or get_param('q')
    if not number_query:
        return make_response_json(False, 'number', '', error='Missing number parameter'), 400
    try:
        result = analyze_number(number_query)
        return make_response_json(True, 'number', number_query, data=result), 200
    except Exception as e:
        return make_response_json(False, 'number', number_query, error=str(e)), 500

@app.route('/api/username', methods=['GET', 'POST', 'OPTIONS'])
def api_username():
    if request.method == 'OPTIONS':
        return '', 204
    username = get_param('username')
    if not username:
        return make_response_json(False, 'username', '', error='Missing username'), 400
    try:
        result = check_username(username)
        return make_response_json(True, 'username', username, data=result), 200
    except ValueError as e:
        return make_response_json(False, 'username', username, error=str(e)), 400
    except Exception:
        return make_response_json(False, 'username', username, error='Internal server error'), 500

@app.route('/api/discord', methods=['GET', 'POST', 'OPTIONS'])
def api_discord():
    if request.method == 'OPTIONS':
        return '', 204
    discord_id = get_param('id')
    if not discord_id:
        return make_response_json(False, 'discord', '', error='Missing Discord ID'), 400
    try:
        result = lookup_discord(discord_id)
        return make_response_json(True, 'discord', discord_id, data=result), 200
    except ValueError as e:
        return make_response_json(False, 'discord', discord_id, error=str(e)), 400
    except Exception:
        return make_response_json(False, 'discord', discord_id, error='Failed to query Discord ID'), 500

@app.route('/api/ip', methods=['GET', 'POST', 'OPTIONS'])
def api_ip():
    if request.method == 'OPTIONS':
        return '', 204
    ip = get_param('ip')
    if not ip:
        return make_response_json(False, 'ip', '', error='Missing IP address'), 400
    try:
        result = lookup_ip(ip)
        return make_response_json(True, 'ip', ip, data=result), 200
    except ValueError as e:
        return make_response_json(False, 'ip', ip, error=str(e)), 400
    except Exception:
        return make_response_json(False, 'ip', ip, error='Failed to resolve IP intelligence'), 500

@app.route('/api/email', methods=['GET', 'POST', 'OPTIONS'])
def api_email():
    if request.method == 'OPTIONS':
        return '', 204
    email = get_param('email')
    if not email:
        return make_response_json(False, 'email', '', error='Missing email'), 400
    try:
        result = lookup_email(email)
        return make_response_json(True, 'email', email, data=result), 200
    except ValueError as e:
        return make_response_json(False, 'email', email, error=str(e)), 400
    except Exception:
        return make_response_json(False, 'email', email, error='Failed to process email intelligence'), 500

@app.route('/api/domain', methods=['GET', 'POST', 'OPTIONS'])
def api_domain():
    if request.method == 'OPTIONS':
        return '', 204
    domain = get_param('domain')
    if not domain:
        return make_response_json(False, 'domain', '', error='Missing domain'), 400
    try:
        result = lookup_domain(domain)
        return make_response_json(True, 'domain', domain, data=result), 200
    except ValueError as e:
        return make_response_json(False, 'domain', domain, error=str(e)), 400
    except Exception:
        return make_response_json(False, 'domain', domain, error='Failed to execute domain recon'), 500

@app.route('/api/phone', methods=['GET', 'POST', 'OPTIONS'])
def api_phone():
    if request.method == 'OPTIONS':
        return '', 204
    phone = get_param('phone')
    if not phone:
        return make_response_json(False, 'phone', '', error='Missing phone number'), 400
    try:
        result = lookup_phone(phone)
        return make_response_json(True, 'phone', phone, data=result), 200
    except ValueError as e:
        return make_response_json(False, 'phone', phone, error=str(e)), 400
    except Exception:
        return make_response_json(False, 'phone', phone, error='Failed to analyze phone number'), 500

@app.route('/api/headers', methods=['GET', 'POST', 'OPTIONS'])
def api_headers():
    if request.method == 'OPTIONS':
        return '', 204
    url = get_param('url')
    if not url:
        return make_response_json(False, 'headers', '', error='Missing URL'), 400
    try:
        result = analyze_headers(url)
        return make_response_json(True, 'headers', url, data=result), 200
    except ValueError as e:
        return make_response_json(False, 'headers', url, error=str(e)), 400
    except Exception:
        return make_response_json(False, 'headers', url, error='Failed to fetch HTTP headers'), 500

@app.route('/api/hash', methods=['GET', 'POST', 'OPTIONS'])
def api_hash():
    if request.method == 'OPTIONS':
        return '', 204
    hash_val = get_param('hash')
    if not hash_val:
        return make_response_json(False, 'hash', '', error='Missing hash string'), 400
    try:
        result = analyze_hash(hash_val)
        return make_response_json(True, 'hash', hash_val, data=result), 200
    except ValueError as e:
        return make_response_json(False, 'hash', hash_val, error=str(e)), 400
    except Exception:
        return make_response_json(False, 'hash', hash_val, error='Failed to analyze hash'), 500

@app.route('/api/dorks', methods=['GET', 'POST', 'OPTIONS'])
def api_dorks():
    if request.method == 'OPTIONS':
        return '', 204
    target = get_param('target')
    if not target:
        return make_response_json(False, 'dorks', '', error='Missing target domain / keyword'), 400
    try:
        result = generate_dorks(target)
        return make_response_json(True, 'dorks', target, data=result), 200
    except ValueError as e:
        return make_response_json(False, 'dorks', target, error=str(e)), 400
    except Exception:
        return make_response_json(False, 'dorks', target, error='Failed to generate dorks'), 500

@app.route('/api/bgp', methods=['GET', 'POST', 'OPTIONS'])
def api_bgp():
    if request.method == 'OPTIONS':
        return '', 204
    asn_query = get_param('asn')
    if not asn_query:
        return make_response_json(False, 'bgp', '', error='Missing ASN number'), 400
    try:
        result = lookup_bgp(asn_query)
        return make_response_json(True, 'bgp', asn_query, data=result), 200
    except ValueError as e:
        return make_response_json(False, 'bgp', asn_query, error=str(e)), 400
    except Exception:
        return make_response_json(False, 'bgp', asn_query, error='Failed to query BGP routing data'), 500

@app.errorhandler(404)
def not_found(error):
    return jsonify({'success': False, 'error': 'Not found'}), 404

@app.errorhandler(500)
def internal_error(error):
    return jsonify({'success': False, 'error': 'Internal server error'}), 500

if __name__ == '__main__':
    import os
    port = int(os.environ.get('PORT', 5000))
    debug = os.environ.get('FLASK_DEBUG', 'true').lower() == 'true'
    app.run(debug=debug, host='0.0.0.0', port=port)
