# PRD · Haeday v1 (launch scope)

Decisions: D01–D08 in DECISIONS.md. Feature flags at launch: SAJU_ENABLED=true; TAROT, DAILY, MATCH, DAEUN, YEAR_AHEAD_ADDON = false.

## 1. Product
Haeday reads a Korean birth chart (saju, "four pillars") in English. Anyone can get a free chart; the paid product is one personal reading for $3.99, one-time. Customers are English speakers (US focus); birthplaces can be anywhere. Buyer must be 18+. Positioning: entertainment and reflection, AI-assisted, grounded in a founder-curated interpretation library.
Target (not a promise): free chart in under 60 seconds on a phone.

## 2. Routes
| Route | Purpose | Access |
|---|---|---|
| `/` | Landing: hook, free vs paid, sample reading, CTA | public |
| `/go` | Social landing, stores bounded UTM, shows the input form | public |
| `/saju` | Input: date, time mode (exact / approximate / don't know), city autocomplete | public |
| `/chart/[id]` | Free chart + questions (fold, boundary) + details-confirm + offer | owner guest or verified customer |
| `/checkout/[chartId]` | Server re-validates stored chart revision, creates Stripe Checkout | owner |
| `/order/[orderId]` | Payment/processing status, then link to reading | owner |
| `/r/[readingId]` | Paid reading | order-scoped guest or verified customer |
| `/login`, `/my` | Email magic link (POST confirm step), purchase list | verified |
| `/refund/[orderId]` | Request form (POST), shows status | order-scoped guest or verified |
| `/method` | How we calculate, data sources, GeoNames attribution | public |
| `/privacy`, `/terms`, `/refunds` | Legal | public |
| `/admin` | Undelivered orders, Retry, Refund, audit | verified session + ADMIN_EMAILS allowlist |

## 3. Input screen (`/saju`)
- Date: MM/DD/YYYY picker, 1900 to today.
- Time: segmented control **I know it** / **Roughly** / **I don't know**.
  - I know it: hh:mm AM/PM.
  - Roughly: same picker with helper "Your best guess is fine. We'll note it's approximate."
  - I don't know: no picker; helper "We'll read your chart from your birth date. No hour pillar."
- City: autocomplete "City, State/Region, Country". Helper: "Used only to adjust for your birthplace's solar time."
- Primary button: "See my birth chart · Free".

## 4. Free chart (`/chart/[id]`)
Order on screen:
1. Question card if needed (never blocks purchase, D06):
   - Fold: "Clocks fell back that night, so 1:30 AM happened twice. Which one?" [The first 1:30] [The second 1:30]
   - Gap: "That time didn't exist on this date because clocks sprang forward. Please check your birth time." (edit link)
   - Boundary (only when `askCustomer` is true, i.e. year or month pillar differs, D25): "Your chart changes during that day. When were you born?" [one button per window, e.g. "Before 3:28 AM"] [I don't know]. Day-only splits show just the disclosure line (item 5).
2. Four pillar tiles (hour tile shows "Hour unknown" when null). Each tile: hanja, English (e.g. "Yang Wood · Rat").
3. Day Master card: name + one-line description (from content/library).
4. Visible element bars with denominator label ("out of 8 characters" or "out of 6").
5. Disclosure line when a default was applied (exact text from engine `disclosure`).
6. Details-confirm: "Your details: {date}, {time or 'time unknown' or 'about {time}'}, {place}. Solar time adjusted. [Edit]". Edit creates a new chart revision.
7. Offer: "Your full reading includes" · Your Day Master in depth · Your elements in balance · Love and relationships · Work and money mindset · Your 2027 energy · One question to reflect on. Button "Unlock my reading · $3.99". Line "One-time payment · No subscription · AI-assisted". If this revision is already purchased: "You already own this reading → Open".
8. Share button → share image preview first.

## 5. Checkout
Checkbox (required): "I'm 18 or older and understand this reading is for entertainment and reflection." Stripe Checkout collects email. Price shown as $3.99; if tax applies, Stripe shows the total.

## 6. Paid reading (`/r/[id]`)
States: `processing` ("Payment received. Writing your reading. This usually takes under a minute.") → `delivered` → `failed_refunded` ("We couldn't complete your reading. Your refund has been started.").
Layout: hanji (light) background, ink text, max width 680px, headings per section, the disclosure repeated at top if present, share/save buttons, "Questions? hello@haeday.com".

## 7. Reading contract (LLM)
Input: `{facts, snippets, tone}` only.
- facts: pillars, dayMaster, visibleElements + denominator, tenGods, timeBasis, disclosure, year2027 facts (2027 = 丁未, starting at 立春 2027 per the canonical jie table (around Feb 4); relation of 丁 and 未 to the customer's day master via the ten-god table).
- snippets: approved entries from content/library with ids and versions.
Output JSON (Zod), total 700–1,100 words:
```json
{"summary":"","dayMaster":"","elements":"","love":"","workMoney":"","year2027":"","reflection":"","usedSnippetIds":[],"disclaimer":"For entertainment and reflection. Not a prediction or professional advice."}
```
Rules: warm, specific, second person, US English. Only interpret supplied facts and snippets; never compute or invent pillars, strength/用神, 대운, or monthly luck. If `timeBasis` is unknown, do not mention the hour pillar; if a disclosure exists, mention it once in plain words. No predictions about death, illness, pregnancy, legal or investment outcomes. No fear, curses, urgency, or upsell. Output rendered as text (escaped), never HTML.
Quality gate before launch: 15 samples scored by Jason on grounding, personalization, English, no contradiction, no forbidden claims; any factual error or unsafe claim fails that sample; need ≥12/15.

## 8. Share image (1080×1920)
Day Master name + element + pillar tiles + "haeday.com". No birth date, time, or place. Preview before download. We don't claim it is anonymous.

## 9. Content library (`content/library/`, Jason-approved)
| File | Entries | Target length (English) |
|---|---|---|
| day-masters.md | 10 (甲–癸): core 3 lines, love 2, work 2, shadow 1 | ~80 words each |
| elements.md | 5 elements × high/low | ~60 words each |
| ten-gods.md | 10 | ~40 words each |
| year-2027.md | 丁未 in general + how it reads for each of the 10 day masters | ~60 words each |
| tone.md | rules and 3 examples | ~150 words |
Each entry: `id`, `version`, `approvedBy: jason`, `appliesWhen`. Only approved entries are used in production. Total ≈ 2,550 words.

## 10. Design (from the Haeday canvas)
```css
--night:#12132A; --dusk:#1C1E3A; --line:#2E3160; --hanji:#F3EBDD; --ink:#1E1B16;
--gold:#D9B26A; --gold-text-on-hanji:#7E5F1C; --mist:#A7A3BE; --text:#F2ECE0;
--wood:#5FA97A; --fire:#E0685A; --earth:#D9B26A; --metal:#C9CCD6; --water:#6FA0D8;
fonts: Fraunces (display), Plus Jakarta Sans (UI), Noto Serif KR (hanja/hangul)
radius 12/16/22 · spacing 8/12/16/20/28 · primary button 56px · body 16/25 · touch ≥ 44px
```
Brand screens dark, long text on hanji. Pillar tiles: element background + #12132A text. Visible focus ring, labels on all inputs, element bars have text values for screen readers, prefers-reduced-motion respected.

## 11. Copy essentials (content/copy.ts)
- H1 "Find your heyday, by moonlight."
- Sub "Your Korean birth chart (saju) shows your nature and your timing. Free chart in under a minute. Full reading $3.99, never a subscription."
- Footer "AI-assisted · For entertainment and reflection · Not advice"

## 12. Legal drafts (Jason reviews; placeholders until D05 checks finish)
- Terms: seller "Jason Hong, doing business as Haeday" (update if the business form changes), 18+ buyer, entertainment only, AI-generated, one-time digital purchase, refund policy link, contact.
- Privacy: collect birth date/time/place and email; purposes; processors (Stripe, Railway, Resend, PostHog, Sentry, LLM provider); retention: unpaid charts 30 days, paid readings and their charts 12 months then deleted, payment records kept as legally required; deletion by email.
- Refunds: automatic if we fail to deliver; any reason within 7 days (one goodwill refund per customer; delivery failures and duplicate charges never count toward it).

## 13. Analytics (PostHog, allowlisted properties only)
Events: landing_view, chart_started, chart_completed{kind,timeBasis}, question_answered{type}, offer_viewed, checkout_started, payment_succeeded (server), reading_delivered{latency_s} (server), refund_succeeded{reason} (server). Properties: utm_source/medium/campaign/content (each ≤ 64 chars, allowlisted charset), device class. Never: birth values, email, tokens, full URLs with query, reading text. Session replay and autocapture off on /chart, /order, /r, /my, /admin.
