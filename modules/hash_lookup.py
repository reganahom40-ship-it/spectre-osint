import re

def analyze_hash(hash_str: str) -> dict:
    hash_str = str(hash_str).strip()
    if not hash_str:
        raise ValueError("Hash string cannot be empty.")

    length = len(hash_str)
    is_hex = bool(re.match(r'^[a-fA-F0-9]+$', hash_str))
    
    possible_types = []

    if is_hex:
        if length == 32:
            possible_types.extend(['MD5', 'NTLM', 'MD4', 'LM', 'Domain Cached Credentials (DCC)'])
        elif length == 40:
            possible_types.extend(['SHA-1', 'MySQL 4.1+', 'RIPEMD-160'])
        elif length == 56:
            possible_types.extend(['SHA-224', 'SHA3-224'])
        elif length == 64:
            possible_types.extend(['SHA-256', 'SHA3-256', 'BLAKE2s-256', 'HMAC-SHA256'])
        elif length == 96:
            possible_types.extend(['SHA-384', 'SHA3-384'])
        elif length == 128:
            possible_types.extend(['SHA-512', 'SHA3-512', 'Whirlpool', 'BLAKE2b-512'])
    
    if hash_str.startswith('$2a$') or hash_str.startswith('$2b$') or hash_str.startswith('$2y$'):
        possible_types.append('bcrypt')
    elif hash_str.startswith('$6$'):
        possible_types.append('SHA-512 Crypt (Unix / Linux)')
    elif hash_str.startswith('$5$'):
        possible_types.append('SHA-256 Crypt (Unix / Linux)')
    elif hash_str.startswith('$1$'):
        possible_types.append('MD5 Crypt (Unix / Linux)')
    elif hash_str.startswith('$argon2id$') or hash_str.startswith('$argon2i$'):
        possible_types.append('Argon2')

    if not possible_types:
        possible_types.append('Unknown / Custom Hash Algorithm')

    return {
        'hash': hash_str,
        'length': length,
        'is_hex': is_hex,
        'primary_match': possible_types[0],
        'possible_algorithms': possible_types,
        'entropy': round(len(set(hash_str)) / len(hash_str), 3) if length > 0 else 0
    }
