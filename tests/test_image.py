from PIL import Image
import os
import io
import base64
from app import app

def test_image_analyze_binary():
    client = app.test_client()
    client.post('/api/auth/login', json={'email': 'admin@spectre.io', 'password': 'spectre_admin_2026'})
    # 1. Test empty request fails cleanly
    r1 = client.post('/api/image/analyze')
    assert r1.status_code == 400
    assert r1.json['success'] is False

    # 2. Test file upload with valid JPEG image
    buf = io.BytesIO()
    img = Image.new('RGB', (32, 32), color='blue')
    img.save(buf, format='JPEG')
    buf.seek(0)

    data = {
        'file': (buf, 'test_camera.jpg')
    }
    r2 = client.post('/api/image/analyze', data=data, content_type='multipart/form-data')
    assert r2.status_code == 200
    assert r2.json['success'] is True
    assert r2.json['filename'] == 'test_camera.jpg'
    assert 'hashes' in r2.json
    assert 'md5' in r2.json['hashes']
    assert 'exif_raw' in r2.json
    assert 'camera' in r2.json

def test_image_analyze_base64():
    client = app.test_client()
    client.post('/api/auth/login', json={'email': 'admin@spectre.io', 'password': 'spectre_admin_2026'})
    buf = io.BytesIO()
    img = Image.new('RGBA', (32, 32), color='red')
    img.save(buf, format='PNG')
    b64 = base64.b64encode(buf.getvalue()).decode('utf-8')

    r = client.post('/api/image/analyze', json={
        'image_base64': f'data:image/png;base64,{b64}',
        'filename': 'clipboard_paste.png'
    })
    assert r.status_code == 200
    assert r.json['success'] is True
    assert r.json['filename'] == 'clipboard_paste.png'
    assert r.json['mime_type'] == 'image/png'
