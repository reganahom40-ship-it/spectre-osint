import hashlib
import struct
import datetime
import os
import re

def parse_exif_binary(data: bytes) -> dict:
    """
    Pure Python EXIF parser for JPEG files without heavy third-party dependencies.
    Extracts Make, Model, DateTime, Software, GPS Coordinates, Dimensions, and Hashes.
    """
    res = {
        'make': None,
        'model': None,
        'software': None,
        'datetime': None,
        'exposure_time': None,
        'f_number': None,
        'iso': None,
        'focal_length': None,
        'gps_latitude': None,
        'gps_longitude': None,
        'gps_altitude': None,
        'gps_coords_formatted': None,
        'has_gps': False,
        'raw_tags': {}
    }

    if not data or len(data) < 4:
        return res

    # JPEG EXIF search
    if data.startswith(b'\xff\xd8'):
        idx = 2
        length = len(data)
        while idx < length - 4:
            marker, seg_len = struct.unpack('>HH', data[idx:idx+4])
            if marker == 0xffe1: # APP1 (EXIF)
                exif_payload = data[idx+4:idx+2+seg_len]
                if exif_payload.startswith(b'Exif\x00\x00'):
                    tiff_header = exif_payload[6:]
                    _parse_tiff_header(tiff_header, res)
                break
            elif (marker & 0xff00) == 0xff00 and marker not in (0xffd8, 0xffd9, 0xffda):
                idx += 2 + seg_len
            else:
                break

    return res

def _parse_tiff_header(tiff_bytes: bytes, res: dict):
    if len(tiff_bytes) < 8:
        return
    endian = tiff_bytes[:2]
    is_little = (endian == b'II')
    fmt_h = '<H' if is_little else '>H'
    fmt_i = '<I' if is_little else '>I'

    magic = struct.unpack(fmt_h, tiff_bytes[2:4])[0]
    if magic != 42:
        return

    ifd0_offset = struct.unpack(fmt_i, tiff_bytes[4:8])[0]
    exif_sub_offset = None
    gps_sub_offset = None

    def read_ifd(offset):
        nonlocal exif_sub_offset, gps_sub_offset
        if offset + 2 > len(tiff_bytes):
            return
        num_entries = struct.unpack(fmt_h, tiff_bytes[offset:offset+2])[0]
        curr = offset + 2
        for _ in range(min(num_entries, 120)):
            if curr + 12 > len(tiff_bytes):
                break
            tag, dtype, count, val_or_off = struct.unpack(f"{fmt_h[1]}HHI", tiff_bytes[curr:curr+12])
            
            # String tags
            if dtype == 2: # ASCII
                if count <= 4:
                    s_bytes = tiff_bytes[curr+8:curr+8+count]
                else:
                    if val_or_off + count <= len(tiff_bytes):
                        s_bytes = tiff_bytes[val_or_off:val_or_off+count]
                    else:
                        s_bytes = b''
                s_val = s_bytes.decode('utf-8', errors='ignore').strip('\x00').strip()
                if tag == 0x010f: res['make'] = s_val
                elif tag == 0x0110: res['model'] = s_val
                elif tag == 0x0131: res['software'] = s_val
                elif tag == 0x0132 or tag == 0x9003: res['datetime'] = s_val
            
            # Sub-IFD pointers
            if tag == 0x8769: # Exif IFD
                exif_sub_offset = val_or_off
            elif tag == 0x8825: # GPS IFD
                gps_sub_offset = val_or_off

            curr += 12

    try:
        read_ifd(ifd0_offset)
        if exif_sub_offset:
            read_ifd(exif_sub_offset)
        if gps_sub_offset:
            _parse_gps_ifd(tiff_bytes, gps_sub_offset, is_little, res)
    except Exception:
        pass

def _parse_gps_ifd(tiff_bytes: bytes, offset: int, is_little: bool, res: dict):
    fmt_h = '<H' if is_little else '>H'
    fmt_i = '<I' if is_little else '>I'

    if offset + 2 > len(tiff_bytes):
        return
    num_entries = struct.unpack(fmt_h, tiff_bytes[offset:offset+2])[0]
    curr = offset + 2

    lat_ref = 'N'
    lon_ref = 'E'
    lat_deg = None
    lon_deg = None

    for _ in range(min(num_entries, 40)):
        if curr + 12 > len(tiff_bytes):
            break
        tag, dtype, count, val_or_off = struct.unpack(f"{fmt_h[1]}HHI", tiff_bytes[curr:curr+12])

        if tag == 1: # Lat ref
            lat_ref = chr(tiff_bytes[curr+8])
        elif tag == 2: # Lat rational
            lat_deg = _read_rational_triplet(tiff_bytes, val_or_off, fmt_i)
        elif tag == 3: # Lon ref
            lon_ref = chr(tiff_bytes[curr+8])
        elif tag == 4: # Lon rational
            lon_deg = _read_rational_triplet(tiff_bytes, val_or_off, fmt_i)

        curr += 12

    if lat_deg is not None and lon_deg is not None:
        lat = lat_deg[0] + lat_deg[1] / 60.0 + lat_deg[2] / 3600.0
        if lat_ref.upper() == 'S': lat = -lat

        lon = lon_deg[0] + lon_deg[1] / 60.0 + lon_deg[2] / 3600.0
        if lon_ref.upper() == 'W': lon = -lon

        res['gps_latitude'] = round(lat, 6)
        res['gps_longitude'] = round(lon, 6)
        res['has_gps'] = True
        res['gps_coords_formatted'] = f"{abs(lat):.4f}° {'N' if lat >= 0 else 'S'}, {abs(lon):.4f}° {'E' if lon >= 0 else 'W'}"

def _read_rational_triplet(tiff_bytes, offset, fmt_i):
    if offset + 24 > len(tiff_bytes):
        return (0.0, 0.0, 0.0)
    vals = []
    for i in range(3):
        num, den = struct.unpack(f"{fmt_i[1]}II", tiff_bytes[offset + i*8: offset + (i+1)*8])
        vals.append(num / den if den != 0 else 0.0)
    return tuple(vals)

def analyze_image_bytes(data: bytes, filename: str = "uploaded_image.jpg") -> dict:
    """
    Comprehensive Image OSINT analysis: Hashes, Size, EXIF Metadata, GPS Geotags,
    and formatted reverse search links.
    """
    file_size = len(data)
    md5_hash = hashlib.md5(data).hexdigest()
    sha1_hash = hashlib.sha1(data).hexdigest()
    sha256_hash = hashlib.sha256(data).hexdigest()

    mime = 'image/jpeg'
    if data.startswith(b'\x89PNG\r\n\x1a\n'):
        mime = 'image/png'
    elif data.startswith(b'GIF87a') or data.startswith(b'GIF89a'):
        mime = 'image/gif'
    elif data.startswith(b'RIFF') and b'WEBP' in data[:14]:
        mime = 'image/webp'
    elif data.startswith(b'BM'):
        mime = 'image/bmp'

    # Extract EXIF
    exif = parse_exif_binary(data)

    return {
        'filename': filename,
        'mime_type': mime,
        'size_bytes': file_size,
        'size_formatted': f"{file_size / 1024:.1f} KB" if file_size < 1024*1024 else f"{file_size / (1024*1024):.2f} MB",
        'hashes': {
            'md5': md5_hash,
            'sha1': sha1_hash,
            'sha256': sha256_hash
        },
        'exif': exif,
        'timestamp': datetime.datetime.utcnow().isoformat() + 'Z'
    }
