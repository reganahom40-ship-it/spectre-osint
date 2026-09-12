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
from modules.engine import InvestigationEngine
from modules.logging_config import setup_logging, log_investigation_summary

setup_logging()
engine = InvestigationEngine()

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

import time

_rate_limit_store = {}

def check_rate_limit(ip, max_requests=30, window=60):
    now = time.time()
    history = _rate_limit_store.get(ip, [])
    history = [t for t in history if now - t < window]
    if len(history) >= max_requests:
        return False
    history.append(now)
    _rate_limit_store[ip] = history
    return True

def get_param(key):
    if request.method == 'GET':
        val = str(request.args.get(key, ''))
    else:
        json_data = request.get_json(silent=True) or {}
        val = json_data.get(key)
        if val is None:
            val = request.form.get(key, '')
        val = str(val)
        
    val = val.replace('\x00', '').strip()
    if len(val) > 500:
        val = val[:500]
    return val

def make_response_json(success, module, query, data=None, error=None):
    return jsonify({
        'success': success,
        'module': module,
        'query': query,
        'data': data,
        'error': error,
        'timestamp': datetime.datetime.utcnow().isoformat() + 'Z'
    })

@app.before_request
def before_request_rate_limit():
    if request.path.startswith('/api/'):
        ip = request.remote_addr
        if not check_rate_limit(ip):
            return jsonify({'success': False, 'error': 'Rate limit exceeded'}), 429

@app.route('/', methods=['GET'])
def index():
    return render_template('index.html')

@app.route('/health', methods=['GET'])
def health():
    return jsonify({'status': 'operational', 'timestamp': datetime.datetime.utcnow().isoformat() + 'Z'}), 200

# =========================================================================
# OMNI-RECON AUTO-DETECTION ENGINE
# =========================================================================
@app.route('/api/investigate', methods=['GET', 'POST', 'OPTIONS'])
@app.route('/api/omni', methods=['GET', 'POST', 'OPTIONS'])
def api_omni():
    if request.method == 'OPTIONS':
        return '', 204
    target = get_param('target') or get_param('q') or get_param('query')
    if not target:
        return make_response_json(False, 'omni', '', error='Missing target query string'), 400

    target = target.strip()
    try:
        resp_data = engine.investigate(target)
        log_investigation_summary(
            resp_data.get('investigation_id', ''),
            target,
            resp_data.get('detected_type', 'unknown'),
            resp_data.get('duration_ms', 0.0),
            len(resp_data.get('errors', []))
        )
        return jsonify({
            'success': True,
            'module': 'omni',
            'query': target,
            'data': resp_data,
            **resp_data
        }), 200
    except Exception as e:
        return make_response_json(False, 'omni', target, error=str(e)), 500

@app.route('/api/breaches', methods=['GET', 'POST', 'OPTIONS'])
def api_breaches():
    if request.method == 'OPTIONS':
        return '', 204
    email = get_param('email') or get_param('target') or get_param('q')
    if not email:
        return make_response_json(False, 'breaches', '', error='Missing email target'), 400
    try:
        breaches_res = engine.hibp_breach_provider.search(email)
        pastes_res = engine.hibp_paste_provider.search(email)
        
        # Calculate risk score
        b_sum_data = breaches_res.data or {}
        p_data = pastes_res.data or {}
        
        breaches_list = [
            BreachRecord(**b) if isinstance(b, dict) and 'name' in b else b
            for b in b_sum_data.get('breaches', [])
        ]
        pastes_list = [
            PasteRecord(**p) if isinstance(p, dict) and 'source' in p else p
            for p in p_data.get('pastes', [])
        ]
        summary = BreachSummary(
            email=email,
            total_breaches=b_sum_data.get('total_breaches', len(breaches_list)),
            total_pastes=p_data.get('total_pastes', len(pastes_list)),
            earliest_breach=b_sum_data.get('earliest_breach', ''),
            latest_breach=b_sum_data.get('latest_breach', ''),
            total_records_exposed=b_sum_data.get('total_records_exposed', 0),
            unique_data_classes=b_sum_data.get('unique_data_classes', []),
            breaches=breaches_list,
            pastes=pastes_list
        )
        risk = engine.risk_engine.calculate(summary)
        
        return jsonify({
            'success': True,
            'module': 'breaches',
            'query': email,
            'data': {
                'summary': summary.to_dict(),
                'risk': risk.to_dict(),
                'breaches': [b.to_dict() for b in breaches_list],
                'pastes': [p.to_dict() for p in pastes_list]
            },
            'timestamp': datetime.datetime.utcnow().isoformat() + 'Z'
        }), 200
    except Exception as e:
        return make_response_json(False, 'breaches', email, error=str(e)), 500

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
