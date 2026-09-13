"""
Advanced Image Forensics & Visual Intelligence Engine for SPECTRE.
Extracts cryptographic file hashes, EXIF/GPS telemetry, camera forensics,
and scans extracted metadata/text for actionable OSINT indicator pivots (URLs, emails, domains).
"""
import io
import re
import hashlib
import logging
from typing import Dict, Any, Optional
from PIL import Image, ExifTags

logger = logging.getLogger(__name__)

# Prevent decompression bomb attacks
Image.MAX_IMAGE_PIXELS = 25_000_000
MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024  # 10MB

# Magic bytes signatures for common image formats
MAGIC_SIGNATURES = {
    b'\xFF\xD8\xFF': 'image/jpeg',
    b'\x89PNG\r\n\x1a\n': 'image/png',
    b'GIF87a': 'image/gif',
    b'GIF89a': 'image/gif',
    b'RIFF': 'image/webp'  # Verified with WEBP chunk
}

INDICATOR_PATTERNS = {
    'email': re.compile(r'[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+'),
    'domain': re.compile(r'\b(?:[a-zA-Z0-9-]+\.)+(?:com|org|net|io|ai|co|dev|app|uk|de|xyz)\b', re.IGNORECASE),
    'ipv4': re.compile(r'\b(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\b'),
    'url': re.compile(r'https?://[^\s<>"]+')
}


def validate_image_security(data: bytes) -> str:
    """Verifies file size and magic bytes against decompression and payload attacks."""
    if len(data) > MAX_IMAGE_SIZE_BYTES:
        raise ValueError(f"Image exceeds maximum allowable file size ({len(data)} > {MAX_IMAGE_SIZE_BYTES} bytes)")
    if len(data) < 16:
        raise ValueError("Image data is corrupted or too small.")

    matched_mime = None
    for sig, mime in MAGIC_SIGNATURES.items():
        if data.startswith(sig):
            if sig == b'RIFF' and len(data) >= 12 and data[8:12] != b'WEBP':
                continue
            matched_mime = mime
            break

    if not matched_mime:
        raise ValueError("Invalid image file format. Supported formats: JPEG, PNG, GIF, WEBP.")

    return matched_mime


def _convert_dms_to_dd(dms_values, ref: str) -> Optional[float]:
    """Converts degrees, minutes, seconds EXIF tuple to decimal degrees."""
    try:
        def to_float(val):
            if isinstance(val, (int, float)):
                return float(val)
            if hasattr(val, 'numerator') and hasattr(val, 'denominator') and val.denominator != 0:
                return float(val.numerator) / float(val.denominator)
            if isinstance(val, tuple) and len(val) == 2 and val[1] != 0:
                return float(val[0]) / float(val[1])
            return float(val)

        d = to_float(dms_values[0])
        m = to_float(dms_values[1])
        s = to_float(dms_values[2])
        dd = d + (m / 60.0) + (s / 3600.0)
        if ref in ('S', 'W'):
            dd = -dd
        return round(dd, 6)
    except Exception:
        return None


def analyze_image_bytes(image_bytes: bytes, filename: str = 'target_image') -> Dict[str, Any]:
    """Performs deep forensic audit, EXIF parsing, GPS resolution, and indicator discovery."""
    mime_type = validate_image_security(image_bytes)

    # 1. Cryptographic File Hashes
    md5_hash = hashlib.md5(image_bytes).hexdigest()
    sha1_hash = hashlib.sha1(image_bytes).hexdigest()
    sha256_hash = hashlib.sha256(image_bytes).hexdigest()

    try:
        img = Image.open(io.BytesIO(image_bytes))
        img.verify()  # Verify integrity
        # Re-open for data extraction
        img = Image.open(io.BytesIO(image_bytes))
    except Exception as e:
        raise ValueError(f"Corrupted or invalid image structure: {str(e)}")

    width, height = img.size
    img_format = img.format or mime_type.split('/')[-1].upper()
    color_mode = img.mode

    # 2. EXIF Metadata Extraction
    exif_data = {}
    gps_info = {}
    camera_metadata = {}
    extracted_text_blocks = []

    raw_exif = img._getexif() if hasattr(img, '_getexif') and callable(img._getexif) else None
    if raw_exif:
        for tag_id, value in raw_exif.items():
            tag_name = ExifTags.TAGS.get(tag_id, str(tag_id))
            # Filter non-serializable objects
            if isinstance(value, (bytes, bytearray)):
                try:
                    str_val = value.decode('utf-8', errors='ignore').strip()
                    if str_val:
                        exif_data[tag_name] = str_val
                        extracted_text_blocks.append(str_val)
                except Exception:
                    pass
            elif isinstance(value, (int, float, str)):
                exif_data[tag_name] = value
                if isinstance(value, str):
                    extracted_text_blocks.append(value)
            elif tag_name == 'GPSInfo' and isinstance(value, dict):
                gps_dict = {}
                for g_tag_id, g_val in value.items():
                    g_tag_name = ExifTags.GPSTAGS.get(g_tag_id, str(g_tag_id))
                    gps_dict[g_tag_name] = g_val
                gps_info = gps_dict

    # Extract Camera particulars
    camera_metadata = {
        'make': exif_data.get('Make', '—'),
        'model': exif_data.get('Model', '—'),
        'software': exif_data.get('Software', '—'),
        'timestamp': exif_data.get('DateTimeOriginal') or exif_data.get('DateTime', '—'),
        'lens': exif_data.get('LensModel', '—'),
        'exposure_time': str(exif_data.get('ExposureTime', '—')),
        'f_number': str(exif_data.get('FNumber', '—')),
        'iso': str(exif_data.get('ISOSpeedRatings', '—'))
    }

    # 3. GPS Geotag Resolution
    geo_location = None
    if gps_info:
        lat_ref = gps_info.get('GPSLatitudeRef', 'N')
        lat_dms = gps_info.get('GPSLatitude')
        lon_ref = gps_info.get('GPSLongitudeRef', 'E')
        lon_dms = gps_info.get('GPSLongitude')

        if lat_dms and lon_dms:
            lat = _convert_dms_to_dd(lat_dms, lat_ref)
            lon = _convert_dms_to_dd(lon_dms, lon_ref)
            if lat is not None and lon is not None:
                geo_location = {
                    'latitude': lat,
                    'longitude': lon,
                    'maps_url': f"https://www.google.com/maps?q={lat},{lon}",
                    'coordinates': f"{abs(lat):.4f}° {'N' if lat >= 0 else 'S'}, {abs(lon):.4f}° {'E' if lon >= 0 else 'W'}"
                }

    # 4. Extract OSINT Pivots from Image Metadata & Comment Strings
    full_text_corpus = " ".join(extracted_text_blocks)
    pivots_found = []

    for ptype, pat in INDICATOR_PATTERNS.items():
        matches = pat.findall(full_text_corpus)
        for m in matches:
            if m not in [p['value'] for p in pivots_found]:
                pivots_found.append({
                    'type': ptype.upper(),
                    'value': m,
                    'source': 'EXIF_METADATA_EXTRACT'
                })

    return {
        'filename': filename,
        'mime_type': mime_type,
        'format': img_format,
        'dimensions': f"{width}x{height}",
        'width': width,
        'height': height,
        'color_mode': color_mode,
        'size_bytes': len(image_bytes),
        'hashes': {
            'md5': md5_hash,
            'sha1': sha1_hash,
            'sha256': sha256_hash
        },
        'camera': camera_metadata,
        'geolocation': geo_location,
        'exif_raw': {k: str(v) for k, v in list(exif_data.items())[:30]},
        'pivots': pivots_found,
        'provenance': 'LOCAL_DERIVATION'
    }
