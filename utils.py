import re
from datetime import datetime


def sanitize_filename(text: str) -> str:
    if not isinstance(text, str):
        return 'unknown'
    safe = re.sub(r'[\\/:*?"<>|]', '_', text)
    return safe.strip() or 'unknown'


def generate_unique_id():
    now = datetime.now()
    return now.strftime('%Y%m%d%H%M%S%f')[:20]