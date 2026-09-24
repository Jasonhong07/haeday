"""Astronomy for the oracle: jie instants and equation of time with Skyfield + DE421."""
from datetime import datetime, timedelta, timezone
from functools import lru_cache
import hashlib, os
from skyfield import almanac, almanac_east_asia as ea
from skyfield.api import Loader
from skyfield_data import get_skyfield_data_path

_loader = Loader(get_skyfield_data_path())
TS = _loader.timescale(builtin=True)
EPH_NAME = "de421.bsp"
EPH = _loader(EPH_NAME)


def ephemeris_sha256() -> str:
    path = os.path.join(get_skyfield_data_path(), EPH_NAME)
    return hashlib.sha256(open(path, "rb").read()).hexdigest()


def jie_instants(start: tuple, end: tuple):
    """UTC instants (datetime, second precision) of the 12 jie, i.e. solar terms at odd index (lon = 15*i)."""
    f = ea.solar_terms(EPH)
    t, idx = almanac.find_discrete(TS.utc(*start), TS.utc(*end), f)
    out = []
    for ti, i in zip(t, idx):
        i = int(i)
        if i % 2 == 1:  # 節 (jie); even indices are 中氣
            raw = ti.utc_datetime()
            dt = (raw + timedelta(microseconds=500_000)).replace(microsecond=0)  # round to nearest second
            out.append((dt, (15 * i) % 360))
    return out


def eot_minutes(utc: datetime) -> float:
    """Apparent minus mean solar time at Greenwich, from the Sun's apparent hour angle."""
    t = TS.from_datetime(utc.replace(tzinfo=timezone.utc) if utc.tzinfo is None else utc)
    earth, sun = EPH["earth"], EPH["sun"]
    ra, _dec, _d = earth.at(t).observe(sun).apparent().radec(epoch="date")
    ha_hours = (t.gast - ra.hours) % 24  # Greenwich apparent hour angle of the Sun
    apparent = (ha_hours + 12) % 24
    ut_hours = utc.hour + utc.minute / 60 + utc.second / 3600
    diff = (apparent - ut_hours) * 60
    return (diff + 720) % 1440 - 720
