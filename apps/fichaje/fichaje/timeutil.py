from datetime import datetime, timezone, timedelta

TZ_DEFECTO = timezone(timedelta(hours=2))

def parse_offset(s: str) -> timezone:
    signo = 1 if s[0] == "+" else -1
    hh, mm = int(s[1:3]), int(s[4:6])
    return timezone(signo * timedelta(hours=hh, minutes=mm))

def a_local(dt: datetime, tz: timezone) -> datetime:
    return dt.astimezone(tz)

def epoch_min(dt: datetime) -> int:
    return int(dt.timestamp() // 60)

def desde_epoch_min(m: int, tz: timezone) -> datetime:
    return datetime.fromtimestamp(m * 60, tz)
