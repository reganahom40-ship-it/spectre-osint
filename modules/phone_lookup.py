import phonenumbers
from phonenumbers import carrier
from phonenumbers import geocoder
from phonenumbers import timezone

def lookup_phone(phone_number: str) -> dict:
    try:
        parsed_number = phonenumbers.parse(phone_number, None)
    except phonenumbers.phonenumberutil.NumberParseException:
        try:
            parsed_number = phonenumbers.parse(phone_number, 'US')
        except phonenumbers.phonenumberutil.NumberParseException:
            raise ValueError(f"Could not parse phone number: {phone_number}")

    if not phonenumbers.is_valid_number(parsed_number):
        raise ValueError(f"Invalid phone number: {phone_number}")

    country_code = parsed_number.country_code
    national_number = str(parsed_number.national_number)
    
    country = geocoder.description_for_number(parsed_number, "en")
    c_name = carrier.name_for_number(parsed_number, "en")
    timezones = list(timezone.time_zones_for_number(parsed_number))
    
    num_type_int = phonenumbers.number_type(parsed_number)
    type_map = {
        0: 'FIXED_LINE', 1: 'MOBILE', 2: 'FIXED_LINE_OR_MOBILE', 3: 'TOLL_FREE',
        4: 'PREMIUM_RATE', 5: 'SHARED_COST', 6: 'VOIP', 7: 'PERSONAL_NUMBER',
        8: 'PAGER', 9: 'UAN', 10: 'VOICEMAIL', -1: 'UNKNOWN'
    }
    line_type = type_map.get(num_type_int, 'UNKNOWN')

    e164 = phonenumbers.format_number(parsed_number, phonenumbers.PhoneNumberFormat.E164)
    international = phonenumbers.format_number(parsed_number, phonenumbers.PhoneNumberFormat.INTERNATIONAL)
    national = phonenumbers.format_number(parsed_number, phonenumbers.PhoneNumberFormat.NATIONAL)
    rfc3966 = phonenumbers.format_number(parsed_number, phonenumbers.PhoneNumberFormat.RFC3966)

    return {
        'input': phone_number,
        'valid': True,
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
        }
    }
