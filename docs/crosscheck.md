# Engine cross-check (M1 gate)

## Part A · Done by Claude (2026-09-24): third-party library check

`lunar_python` (6tail "lunar", a widely used Chinese 八字 library with its own solar-term algorithm) was compared with our engine:

- 3,000 random births 1901–2025 in 11 cities (US, Seoul, Sydney, Kiritimati): **all four pillars match on 3,000/3,000** (`tests/engine/lunar.test.ts`, generator `tools/oracle/crosscheck_lunar.py`; 53 samples within 5 min of a solar term or 1 min of an hour edge skipped because the two libraries' term instants differ by ~1 s).
- The 10 cases below: **10/10 match** (column "lunar_python").
- This confirms the pillar arithmetic, the solar-term table and our 야자시 convention (23:00–24:00 keeps the day, hour stem from the next day = lunar_python `sect=2`). It does **not** tell us what Korean apps do with overseas births; that is Part B.

## Part B · Jason: two Korean apps (about 20 minutes)

**할 일은 "앱에 입력하고 나온 8글자를 적는 것"뿐입니다. 차이 원인 분석은 Claude가 합니다.**

1. 휴대폰에 **포스텔러 만세력**과 **만세력 8자어때**(없으면 해외 출생지 입력이 되는 다른 만세력 앱)를 설치합니다.
2. 앱 설정에서 켤 수 있는 것은 켭니다: 해외 출생 / 출생지 설정, 서머타임 보정, 진태양시(또는 경도 보정), 야자시. 없는 설정은 그냥 넘어가고 아래 "앱 설정 메모"에 "없음"이라고 적습니다.
3. 아래 표의 10명을 한 명씩 입력합니다. 성별은 아무거나, 양력, 출생지는 표의 도시.
4. 앱이 보여주는 **년주 월주 일주 시주** 8글자를 해당 칸에 적습니다. 우리 결과와 똑같으면 "같음"만 적어도 됩니다.
5. 다 채우면 이 파일을 저장하고 Claude에게 "크로스체크 채웠어"라고 말하면 됩니다. (또는 앱 화면 캡처 10장을 채팅에 올려도 됩니다.)

앱 설정 메모 · 앱 1: ________ · 앱 2: ________

| ID | 생년월일 시각 (현지 시각) | 출생지 | Haeday 결과 (년 월 일 시) | Haeday 진태양시 | lunar_python | 앱 1 결과 | 앱 2 결과 | 차이 원인 (Claude 작성) |
|---|---|---|---|---|---|---|---|---|
| F01 | 1990-05-12 09:30 | Seoul, KR | 庚午 辛巳 丁丑 乙巳 | 09:01 | 같음 | | | |
| F02 | 1985-03-20 14:15 | New York, NY, US | 乙丑 己卯 戊午 己未 | 14:11 | 같음 | | | |
| F04 | 1998-12-24 18:05 | Chicago, IL, US | 戊寅 甲子 乙巳 乙酉 | 18:14 | 같음 | | | |
| F09 | 1995-07-15 00:50 | Anchorage, AK, US | 乙亥 癸未 丙午 己亥 | 22:44 (전날) | 같음 | | | |
| F13 | 1992-06-10 00:48 | Chicago, IL, US | 壬申 丙午 丙辰 庚子 | 23:58 (전날) | 같음 | | | |
| F15 | 2024-02-04 03:26 | New York, NY, US | 癸卯 乙丑 戊戌 甲寅 | 03:16 | 같음 | | | |
| F17 | 2024-02-04 03:28 | New York, NY, US | 甲辰 丙寅 戊戌 甲寅 | 03:18 | 같음 | | | |
| F24 | 1955-06-15 10:00 | Seoul, KR | 乙未 壬午 丁未 甲辰 | 08:58 | 같음 | | | |
| F25 | 1987-07-15 00:40 | Seoul, KR | 丁卯 丁未 甲子 丙子 | 23:02 (전날) | 같음 | | | |
| F29 | 1995-01-15 23:10 | Sydney, NSW, AU | 甲戌 丁丑 丙午 己亥 | 22:05 | 같음 | | | |

Why these cases (for the reviewer)
- F09, F13, F25: solar correction moves the time before midnight, so the day pillar is the previous day. Apps without longitude/EoT correction will show the next day.
- F13 is 23:58 true solar time: apps without equation-of-time correction may show the next hour.
- F15 vs F17 sit one minute on each side of 立春 2024 (08:27:08 UTC). Apps that use Korean time for New York births will get this wrong.
- F24 is Seoul 1955 (UTC+8:30 era with summer time); F25 is Seoul 1987 summer time.
- Expected: differences only where an app lacks a setting we use. A difference with all settings matched = engine bug → sales stay off (D10).
