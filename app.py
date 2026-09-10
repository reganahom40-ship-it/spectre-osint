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

    detected_type = 'username'
    dossier = {}

    # 1. IP Check
    ip_pattern = r'^(\d{1,3}\.){3}\d{1,3}$'
    if re.match(ip_pattern, target):
        detected_type = 'ip'
        try:
            ip_res = lookup_ip(target)
            dossier['ip'] = ip_res
            asn = ip_res.get('asn') or ip_res.get('as') or ''
            asn_match = re.search(r'AS\d+', asn, re.IGNORECASE)
            if asn_match:
                try:
                    dossier['bgp'] = lookup_bgp(asn_match.group(0))
                except Exception:
                    pass
        except Exception as e:
            dossier['ip_error'] = str(e)

    # 2. Discord Snowflake Check (17-19 digits)
    elif re.match(r'^\d{17,19}$', target):
        detected_type = 'discord'
        try:
            dossier['discord'] = lookup_discord(target)
        except Exception as e:
            dossier['discord_error'] = str(e)

    # 3. Email Check
    elif '@' in target and '.' in target:
        detected_type = 'email'
        try:
            dossier['email'] = lookup_email(target)
        except Exception as e:
            dossier['email_error'] = str(e)
        domain_part = target.split('@')[-1]
        try:
            dossier['domain'] = lookup_domain(domain_part)
            dossier['dorks'] = generate_dorks(domain_part)
        except Exception:
            pass

    # 4. Hash Check (Hex strings of length 32, 40, 64)
    elif re.match(r'^[a-fA-F0-9]{32}$|^[a-fA-F0-9]{40}$|^[a-fA-F0-9]{64}$', target):
        detected_type = 'hash'
        try:
            dossier['hash'] = analyze_hash(target)
        except Exception as e:
            dossier['hash_error'] = str(e)

    # 5. Domain / URL Check
    elif '.' in target and not target.startswith('+') and not ' ' in target:
        detected_type = 'domain'
        clean_domain = re.sub(r'^https?://', '', target).split('/')[0]
        try:
            dossier['domain'] = lookup_domain(clean_domain)
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

    # 6. Phone Check
    elif target.startswith('+') or (re.match(r'^\+?[\d\s\-\(\)]{8,20}$', target) and sum(c.isdigit() for c in target) >= 10):
        detected_type = 'phone'
        try:
            dossier['phone'] = lookup_phone(target)
        except Exception as e:
            dossier['phone_error'] = str(e)

    # 7. Default: Username & Dorks
    else:
        detected_type = 'username'
        try:
            dossier['username'] = check_username(target)
        except Exception as e:
            dossier['username_error'] = str(e)
        try:
            dossier['dorks'] = generate_dorks(target)
        except Exception:
            pass

    return make_response_json(True, 'omni', target, data={
        'detected_type': detected_type,
        'dossier': dossier
    }), 200

# =========================================================================
# DEDICATED INDIVIDUAL API ROUTES
# =========================================================================
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
