# Engine cross-check (M1 gate)

## Part A · Done by Claude (2026-09-24): third-party library check

`lunar_python` (6tail "lunar", a widely used Chinese 八字 library with its own solar-term algorithm) was compared with our engine:

- 3,000 random births 1901–2025 in 414 places (the 11 fixture cities + 400 random cities from the bundled dataset, every continent): **all four pillars match on 3,000/3,000** (`tests/engine/lunar.test.ts`, generator `tools/oracle/crosscheck_lunar.py`; 54 samples within 5 min of a solar term or 1 min of an hour edge skipped because the two libraries' term instants differ by ~1 s).
- The 10 cases below: **10/10 match** (column "lunar_python").
- This confirms the pillar arithmetic, the solar-term table and our 야자시 convention (23:00–24:00 keeps the day, hour stem from the next day = lunar_python `sect=2`). It does **not** tell us what Korean apps do with overseas births; that is Part B.

## Part B · Two Korean apps (done 2026-09-24: 천을귀인 by Jason, 포스텔러 web by Claude)

How it was done: each case entered with the birthplace city, summer-time correction and 야자시 on where the app offers them; the eight characters shown were recorded.

앱 설정 메모
- 앱 1: **만세력 천을귀인** (Jason, 휴대폰, 2026-09-24). 해외 출생지·서머타임 보정·진태양시 설정 없음, 야자시 선택.
- 앱 2: **포스텔러 만세력 웹** (pro.forceteller.com, Claude가 브라우저로 직접 입력, 2026-09-24). 도시 선택(해외 포함), 야자시/조자시 체크. 앱이 자동으로 "지역시(경도) 보정 + 서머타임 보정"을 표시함.

| ID | 생년월일 시각 (현지 시각) | 출생지 | Haeday 결과 (년 월 일 시) | Haeday 진태양시 | lunar_python | 앱 1 천을귀인 | 앱 2 포스텔러 (표시된 지역시) | 차이 원인 (Claude 작성) |
|---|---|---|---|---|---|---|---|---|
| F01 | 1990-05-12 09:30 | Seoul, KR | 庚午 辛巳 丁丑 乙巳 | 09:01 | 같음 | 같음 | 庚午 辛巳 丁丑 **甲辰** (08:58) | 포스텔러는 경도 보정(-32분)만 하고 균시차(+3.6분)를 안 넣음 → 09:00 시 경계 바로 앞이라 辰시. 정책 차이(D26), 엔진 오류 아님 |
| F02 | 1985-03-20 14:15 | New York, NY, US | 乙丑 己卯 戊午 己未 | 14:11 | 같음 | 같음 | 같음 (14:18) | — |
| F04 | 1998-12-24 18:05 | Chicago, IL, US | 戊寅 甲子 乙巳 乙酉 | 18:14 | 같음 | 같음 | 같음 (18:14) | — |
| F09 | 1995-07-15 00:50 | Anchorage, AK, US | 乙亥 癸未 丙午 己亥 | 22:44 (전날) | 같음 | 乙亥 癸未 **丁未 庚子** | 같음 (22:50 전날) | 천을귀인: 입력 시각을 한국시로 보고 -30분만 적용, 서머타임·현지 경도 미반영 → 7/15 子시 |
| F13 | 1992-06-10 00:48 | Chicago, IL, US | 壬申 丙午 丙辰 庚子 | 23:58 (전날) | 같음 | 壬申 丙午 **丁巳** 庚子 | 같음 (23:57 전날) | 천을귀인: 서머타임·현지 경도 미반영 → 6/10 00:18 조자시로 일주가 하루 뒤 |
| F15 | 2024-02-04 03:26 | New York, NY, US | 癸卯 乙丑 戊戌 甲寅 | 03:16 | 같음 | 癸卯 乙丑 戊戌 **癸丑** | 같음 (03:29) | 천을귀인: 고정 -30분 → 02:56 丑시 |
| F17 | 2024-02-04 03:28 | New York, NY, US | 甲辰 丙寅 戊戌 甲寅 | 03:18 | 같음 | **癸卯 乙丑** 戊戌 **癸丑** | 같음 (03:31) | 천을귀인: 뉴욕 시각을 한국시로 계산 → 입춘(한국시 17:27) 전으로 판정. 설계 의도대로 잡아낸 케이스 |
| F24 | 1955-06-15 10:00 | Seoul, KR | 乙未 壬午 丁未 甲辰 | 08:58 | 같음 | 乙未 壬午 丁未 **乙巳** | 같음 (08:58) | 천을귀인: 1955년 서머타임 미반영 + 고정 -30분 → 09:30 巳시 |
| F25 | 1987-07-15 00:40 | Seoul, KR | 丁卯 丁未 甲子 丙子 | 23:02 (전날) | 같음 | 같음 | 같음 (23:08 전날) | — |
| F29 | 1995-01-15 23:10 | Sydney, NSW, AU | 甲戌 丁丑 丙午 己亥 | 22:05 | 같음 | 같음 | 같음 (22:14) | — |

**결론 (Claude, 2026-09-24)**
- 천을귀인: 10건 중 5건 다름. 5건 모두 "입력 시각을 한국시로 보고 고정 -30분 + 한국 서머타임(1987)만 적용" 한 가지 규칙으로 전부 설명됨. 해외 출생 기능이 없는 앱의 한계이고 엔진 오류는 0건.
- 포스텔러: 10건 중 9건 완전 일치(해외 시간대, 서머타임, 입춘 절입 시각, 야자시 모두 일치). 1건(F01)은 균시차 포함 여부 차이.
- 설명되지 않는 차이 0건 → M1 크로스체크 게이트 통과.
- **남은 정책 결정:** 한국 1위 앱(포스텔러)은 균시차를 쓰지 않는 "지역시"를 씀. 우리가 균시차를 빼면 포스텔러와 10/10 일치. 결정은 DECISIONS D28(proposed).

Why these cases (for the reviewer)
- F09, F13, F25: solar correction moves the time before midnight, so the day pillar is the previous day. Apps without longitude/EoT correction will show the next day.
- F13 is 23:58 true solar time: apps without equation-of-time correction may show the next hour.
- F15 vs F17 sit one minute on each side of 立春 2024 (08:27:08 UTC). Apps that use Korean time for New York births will get this wrong.
- F24 is Seoul 1955 (UTC+8:30 era with summer time); F25 is Seoul 1987 summer time.
- Expected: differences only where an app lacks a setting we use. A difference with all settings matched = engine bug → sales stay off (D10).
