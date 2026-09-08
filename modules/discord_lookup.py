import datetime
import requests
import re

def lookup_discord(user_id: str) -> dict:
    user_id = str(user_id).strip()
    if not re.match(r'^\d{17,20}$', user_id):
        raise ValueError("Invalid Discord Snowflake ID. Must be a 17-20 digit integer.")

    snowflake = int(user_id)

    # Discord Epoch is 2015-01-01T00:00:00Z (1420070400000 ms)
    DISCORD_EPOCH = 1420070400000
    timestamp_ms = (snowflake >> 22) + DISCORD_EPOCH
    creation_date = datetime.datetime.fromtimestamp(timestamp_ms / 1000.0, tz=datetime.timezone.utc)
    
    worker_id = (snowflake & 0x3E0000) >> 17
    process_id = (snowflake & 0x1F000) >> 12
    increment = snowflake & 0xFFF

    now = datetime.datetime.now(datetime.timezone.utc)
    account_age_days = (now - creation_date).days

    # Attempt public profile resolution via multiple endpoints
    profile_data = {}
    avatar_url = None
    banner_url = None
    username = None
    global_name = None
    bot = False
    badges = []

    try:
        resp = requests.get(f"https://discordlookup.mesalytic.moe/v1/user/{user_id}", timeout=4)
        if resp.status_code == 200:
            data = resp.json()
            username = data.get('username')
            global_name = data.get('global_name') or data.get('display_name')
            bot = data.get('bot', False)
            
            if data.get('avatar'):
                avatar_id = data['avatar'].get('id')
                avatar_url = data['avatar'].get('link') or f"https://cdn.discordapp.com/avatars/{user_id}/{avatar_id}.png?size=512"
            
            if data.get('banner'):
                banner_url = data['banner'].get('link')
            
            badges = data.get('badges', [])
    except Exception:
        pass

    # Fallback to direct avatar URL if not resolved
    if not avatar_url:
        avatar_url = f"https://cdn.discordapp.com/embed/avatars/{int(user_id) % 5}.png"

    return {
        'id': user_id,
        'username': username or f"User_{user_id[-4:]}",
        'global_name': global_name or username or "Unknown Name",
        'bot': bot,
        'avatar_url': avatar_url,
        'banner_url': banner_url,
        'badges': badges,
        'created_at': creation_date.strftime("%Y-%m-%d %H:%M:%S UTC"),
        'created_timestamp': int(timestamp_ms / 1000),
        'account_age_days': account_age_days,
        'account_age_years': round(account_age_days / 365.25, 2),
        'snowflake_metadata': {
            'worker_id': worker_id,
            'process_id': process_id,
            'increment': increment
        }
    }
