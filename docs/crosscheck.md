# Engine cross-check vs Korean 만세력 apps (Jason, M1)

How: in **포스텔러 만세력** and **만세력 8자어때** (or another app with an overseas-birth option), enter each birth below with the birthplace set to the listed city (해외 출생 / 출생지 설정 on, 서머타임 보정 on, 진태양시/균시차 on if available, 야자시 on). Write the four pillars the app shows. If an app lacks a setting, note it.

Our policy: DST removed, longitude + equation-of-time solar correction, months by solar terms in absolute time, 야자시 (23:00–24:00 keeps the current day). Differences caused by a different app setting are expected; write which setting explains it.

| ID | Birth (local wall time) | Place | Haeday: year month day hour | Haeday true solar time | App 1 result | App 2 result | Difference explained by |
|---|---|---|---|---|---|---|---|
| F01 | 1990-05-12 09:30 | Seoul, KR | 庚午 辛巳 丁丑 乙巳 | 09:01 | | | |
| F02 | 1985-03-20 14:15 | New York, NY, US | 乙丑 己卯 戊午 己未 | 14:11 | | | |
| F04 | 1998-12-24 18:05 | Chicago, IL, US | 戊寅 甲子 乙巳 乙酉 | 18:14 | | | |
| F09 | 1995-07-15 00:50 | Anchorage, AK, US | 乙亥 癸未 丙午 己亥 | 22:44 | | | |
| F13 | 1992-06-10 00:48 | Chicago, IL, US | 壬申 丙午 丙辰 庚子 | 23:58 | | | |
| F15 | 2024-02-04 03:26 | New York, NY, US | 癸卯 乙丑 戊戌 甲寅 | 03:16 | | | |
| F17 | 2024-02-04 03:28 | New York, NY, US | 甲辰 丙寅 戊戌 甲寅 | 03:18 | | | |
| F24 | 1955-06-15 10:00 | Seoul, KR | 乙未 壬午 丁未 甲辰 | 08:58 | | | |
| F25 | 1987-07-15 00:40 | Seoul, KR | 丁卯 丁未 甲子 丙子 | 23:02 | | | |
| F29 | 1995-01-15 23:10 | Sydney, NSW, AU | 甲戌 丁丑 丙午 己亥 | 22:05 | | | |

Notes
- F13 is 23:58 true solar time: apps without equation-of-time correction may show the next hour/day.
- F15 vs F17 sit one minute on each side of 立春 2024 (08:27:08 UTC). Apps that use Korean time for New York births will get this wrong.
- F24 is Seoul 1955 (UTC+8:30 era with summer time); F25 is Seoul 1987 summer time.
