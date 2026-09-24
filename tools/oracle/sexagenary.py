"""Independent stem/branch arithmetic for the oracle. Must not share code with the TypeScript engine."""
STEMS = "甲乙丙丁戊己庚辛壬癸"
BRANCHES = "子丑寅卯辰巳午未申酉戌亥"
# Branch of the month that begins at each jie longitude.
JIE_LON_TO_BRANCH = {315: 2, 345: 3, 15: 4, 45: 5, 75: 6, 105: 7, 135: 8, 165: 9, 195: 10, 225: 11, 255: 0, 285: 1}


def ganzhi(index60: int) -> str:
    return STEMS[index60 % 10] + BRANCHES[index60 % 12]


def year_index(solar_year: int) -> int:
    # 1984 is 甲子 (index 0).
    return (solar_year - 1984) % 60


def month_ganzhi(year_stem: int, month_branch: int) -> str:
    # 五虎遁 by lookup table (deliberately different from a formula): stem of the 寅 month.
    yin_stem = {0: 2, 5: 2, 1: 4, 6: 4, 2: 6, 7: 6, 3: 8, 8: 8, 4: 0, 9: 0}[year_stem]
    offset = (month_branch - 2) % 12
    return STEMS[(yin_stem + offset) % 10] + BRANCHES[month_branch]


def jdn(y: int, m: int, d: int) -> int:
    """Julian day number of a proleptic Gregorian civil date (Fliegel–Van Flandern)."""
    a = (14 - m) // 12
    yy = y + 4800 - a
    mm = m + 12 * a - 3
    return d + (153 * mm + 2) // 5 + 365 * yy + yy // 4 - yy // 100 + yy // 400 - 32045


def day_index(y: int, m: int, d: int) -> int:
    # Published fact: JDN 2451545 (2000-01-01) is 戊午 = index 54.
    return (jdn(y, m, d) - 11) % 60


def hour_ganzhi(day_stem_for_zi: int, minutes_of_day: int) -> str:
    branch = ((minutes_of_day + 60) // 120) % 12
    # 五鼠遁 lookup: stem of the 子 hour for each day stem.
    zi_stem = {0: 0, 5: 0, 1: 2, 6: 2, 2: 4, 7: 4, 3: 6, 8: 6, 4: 8, 9: 8}[day_stem_for_zi]
    return STEMS[(zi_stem + branch) % 10] + BRANCHES[branch]
