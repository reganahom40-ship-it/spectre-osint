import phonenumbers
from phonenumbers import carrier
from phonenumbers import geocoder
from phonenumbers import timezone
import re

def lookup_phone(phone_number: str) -> dict:
    raw = str(phone_number).strip()
    digits = ''.join(c for c in raw if c.isdigit())
    
    parsed_number = None
    is_valid = False
    
    # Try parsing with no default, then US, then GB
    for region in [None, 'US', 'GB', 'IN', 'DE', 'FR', 'AU']:
        try:
            p = phonenumbers.parse(raw if raw.startswith('+') else ('+' + raw if len(digits) > 10 else raw), region)
            if phonenumbers.is_possible_number(p):
                parsed_number = p
                is_valid = phonenumbers.is_valid_number(p)
                if is_valid:
                    break
        except Exception:
            continue
            
    if not parsed_number:
        try:
            parsed_number = phonenumbers.parse('+1' + digits if len(digits) == 10 else '+' + digits, None)
            is_valid = phonenumbers.is_valid_number(parsed_number)
        except Exception:
            pass

    country_code = parsed_number.country_code if parsed_number else (1 if len(digits) == 10 else 'Unknown')
    national_number = str(parsed_number.national_number) if parsed_number else digits
    
    if parsed_number and is_valid:
        country = geocoder.description_for_number(parsed_number, 'en') or 'International / Geographic'
        c_name = carrier.name_for_number(parsed_number, 'en') or 'Carrier Info Unavailable'
        timezones = list(timezone.time_zones_for_number(parsed_number))
        
        num_type_int = phonenumbers.number_type(parsed_number)
        type_map = {
            0: 'FIXED_LINE', 1: 'MOBILE', 2: 'FIXED_LINE_OR_MOBILE', 3: 'TOLL_FREE',
            4: 'PREMIUM_RATE', 5: 'SHARED_COST', 6: 'VOIP', 7: 'PERSONAL_NUMBER',
            8: 'PAGER', 9: 'UAN', 10: 'VOICEMAIL', -1: 'UNKNOWN'
        }
        line_type = type_map.get(num_type_int, 'STANDARD')
        
        try:
            e164 = phonenumbers.format_number(parsed_number, phonenumbers.PhoneNumberFormat.E164)
            international = phonenumbers.format_number(parsed_number, phonenumbers.PhoneNumberFormat.INTERNATIONAL)
            national = phonenumbers.format_number(parsed_number, phonenumbers.PhoneNumberFormat.NATIONAL)
            rfc3966 = phonenumbers.format_number(parsed_number, phonenumbers.PhoneNumberFormat.RFC3966)
        except Exception:
            e164 = f'+{digits}'
            international = f'+{digits}'
            national = digits
            rfc3966 = f'tel:+{digits}'
    else:
        country = 'Invalid / Unallocated ITU Prefix'
        c_name = 'Unassigned Number / No Carrier'
        timezones = []
        line_type = 'UNASSIGNED_RANGE'
        e164 = f'+{digits}' if digits else 'Invalid'
        international = f'+{digits}' if digits else 'Invalid'
        national = digits or 'Invalid'
        rfc3966 = f'tel:+{digits}' if digits else 'Invalid'

    clean_digits = digits.lstrip('0')
    
    return {
        'input': raw,
        'valid': is_valid,
        'digits': digits,
        'country_code': country_code,
        'national_number': national_number,
        'country': country,
        'carrier': c_name,
        'line_type': line_type,
        'timezones': timezones,
        'formatted': {
            'e164': e164,
            'international': international,
            'national': national,
            'rfc3966': rfc3966
        },
        'messaging_pivots': {
            'whatsapp_url': f'https://wa.me/{clean_digits}',
            'telegram_url': f'https://t.me/+{clean_digits}',
            'truecaller_search': f'https://www.truecaller.com/search/none/{digits}',
            'numlookup_search': f'https://www.numlookup.com/search?number={digits}'
        }
    }
