from flask import Flask, request, jsonify, render_template
import datetime

from modules.username import check_username
from modules.ip_lookup import lookup_ip
from modules.email_lookup import lookup_email
from modules.domain_lookup import lookup_domain
from modules.phone_lookup import lookup_phone
from modules.headers import analyze_headers

app = Flask(__name__, static_folder='static', template_folder='templates')

@app.after_request
def add_cors_headers(response):
    response.headers['Access-Control-Allow-Origin'] = '*'
    response.headers['Access-Control-Allow-Headers'] = 'Content-Type'
    response.headers['Access-Control-Allow-Methods'] = 'POST, GET, OPTIONS'
    return response

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

@app.route('/api/username', methods=['POST', 'OPTIONS'])
def api_username():
    if request.method == 'OPTIONS':
        return '', 204
    data = request.get_json(silent=True) or {}
    username = data.get('username')
    if not username:
        return make_response_json(False, 'username', '', error='Missing username'), 400
    username = str(username).strip()
    if not username:
        return make_response_json(False, 'username', '', error='Empty username'), 400
    
    try:
        result = check_username(username)
        return make_response_json(True, 'username', username, data=result), 200
    except ValueError as e:
        return make_response_json(False, 'username', username, error=str(e)), 400
    except Exception as e:
        return make_response_json(False, 'username', username, error='Internal server error'), 500

@app.route('/api/ip', methods=['POST', 'OPTIONS'])
def api_ip():
    if request.method == 'OPTIONS':
        return '', 204
    data = request.get_json(silent=True) or {}
    ip = data.get('ip')
    if not ip:
        return make_response_json(False, 'ip', '', error='Missing ip'), 400
    ip = str(ip).strip()
    if not ip:
        return make_response_json(False, 'ip', '', error='Empty ip'), 400
    
    try:
        result = lookup_ip(ip)
        return make_response_json(True, 'ip', ip, data=result), 200
    except ValueError as e:
        return make_response_json(False, 'ip', ip, error=str(e)), 400
    except Exception as e:
        return make_response_json(False, 'ip', ip, error='Internal server error'), 500

@app.route('/api/email', methods=['POST', 'OPTIONS'])
def api_email():
    if request.method == 'OPTIONS':
        return '', 204
    data = request.get_json(silent=True) or {}
    email = data.get('email')
    if not email:
        return make_response_json(False, 'email', '', error='Missing email'), 400
    email = str(email).strip()
    if not email:
        return make_response_json(False, 'email', '', error='Empty email'), 400
    
    try:
        result = lookup_email(email)
        return make_response_json(True, 'email', email, data=result), 200
    except ValueError as e:
        return make_response_json(False, 'email', email, error=str(e)), 400
    except Exception as e:
        return make_response_json(False, 'email', email, error='Internal server error'), 500

@app.route('/api/domain', methods=['POST', 'OPTIONS'])
def api_domain():
    if request.method == 'OPTIONS':
        return '', 204
    data = request.get_json(silent=True) or {}
    domain = data.get('domain')
    if not domain:
        return make_response_json(False, 'domain', '', error='Missing domain'), 400
    domain = str(domain).strip()
    if not domain:
        return make_response_json(False, 'domain', '', error='Empty domain'), 400
    
    try:
        result = lookup_domain(domain)
        return make_response_json(True, 'domain', domain, data=result), 200
    except ValueError as e:
        return make_response_json(False, 'domain', domain, error=str(e)), 400
    except Exception as e:
        return make_response_json(False, 'domain', domain, error='Internal server error'), 500

@app.route('/api/phone', methods=['POST', 'OPTIONS'])
def api_phone():
    if request.method == 'OPTIONS':
        return '', 204
    data = request.get_json(silent=True) or {}
    phone = data.get('phone')
    if not phone:
        return make_response_json(False, 'phone', '', error='Missing phone'), 400
    phone = str(phone).strip()
    if not phone:
        return make_response_json(False, 'phone', '', error='Empty phone'), 400
    
    try:
        result = lookup_phone(phone)
        return make_response_json(True, 'phone', phone, data=result), 200
    except ValueError as e:
        return make_response_json(False, 'phone', phone, error=str(e)), 400
    except Exception as e:
        return make_response_json(False, 'phone', phone, error='Internal server error'), 500

@app.route('/api/headers', methods=['POST', 'OPTIONS'])
def api_headers():
    if request.method == 'OPTIONS':
        return '', 204
    data = request.get_json(silent=True) or {}
    url = data.get('url')
    if not url:
        return make_response_json(False, 'headers', '', error='Missing url'), 400
    url = str(url).strip()
    if not url:
        return make_response_json(False, 'headers', '', error='Empty url'), 400
    
    try:
        result = analyze_headers(url)
        return make_response_json(True, 'headers', url, data=result), 200
    except ValueError as e:
        return make_response_json(False, 'headers', url, error=str(e)), 400
    except Exception as e:
        return make_response_json(False, 'headers', url, error='Internal server error'), 500

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
