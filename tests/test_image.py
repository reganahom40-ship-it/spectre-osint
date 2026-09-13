import os
import io
from app import app

def test_image_analyze_binary():
    client = app.test_client()
    # 1. Test empty request fails cleanly
    r1 = client.post('/api/image/analyze')
    assert r1.status_code == 400
    assert r1.json['success'] is False

    # 2. Test file upload with dummy JPEG header
    fake_jpeg = b'\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x01\x00`\x00`\x00\x00\xff\xdb\x00C\x00\xff\xd9'
    data = {
        'file': (io.BytesIO(fake_jpeg), 'test_camera.jpg')
    }
    r2 = client.post('/api/image/analyze', data=data, content_type='multipart/form-data')
    assert r2.status_code == 200
    assert r2.json['success'] is True
    assert r2.json['filename'] == 'test_camera.jpg'
    assert 'hashes' in r2.json
    assert 'md5' in r2.json['hashes']
    assert 'exif' in r2.json

def test_image_analyze_base64():
    client = app.test_client()
    import base64
    fake_png = b'\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15c4\x00\x00\x00\nIDATx\x9cc\x00\x01\x00\x00\x05\x00\x01\r\n-\xb4\x00\x00\x00\x00IEND\xaeB`\x82'
    b64 = base64.b64encode(fake_png).decode('utf-8')

    r = client.post('/api/image/analyze', json={
        'image_base64': f'data:image/png;base64,{b64}',
        'filename': 'clipboard_paste.png'
    })
    assert r.status_code == 200
    assert r.json['success'] is True
    assert r.json['filename'] == 'clipboard_paste.png'
    assert r.json['mime_type'] == 'image/png'
