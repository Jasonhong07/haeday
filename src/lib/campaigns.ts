// L4 (D40): channels come ONLY from our own list or from the referrer's host. Never store full URLs, query strings,
// or anything a person typed. Add a campaign here before using /go?c=<id> in a post, bio or ad.
export const CAMPAIGNS = [
  "tiktok", "instagram", "reddit", "x", "youtube", "pinterest", "threads", "facebook",
  "newsletter", "friend", "influencer1", "influencer2", "influencer3",
] as const;
export type Campaign = (typeof CAMPAIGNS)[number];

const SEARCH = [/(^|\.)google\./, /(^|\.)bing\.com$/, /(^|\.)duckduckgo\.com$/, /(^|\.)yahoo\.com$/, /(^|\.)ecosia\.org$/, /(^|\.)naver\.com$/];
const SOCIAL = [/(^|\.)tiktok\.com$/, /(^|\.)instagram\.com$/, /(^|\.)facebook\.com$/, /(^|\.)reddit\.com$/, /(^|\.)(x|twitter)\.com$/, /(^|\.)t\.co$/, /(^|\.)youtube\.com$/, /(^|\.)pinterest\.com$/, /(^|\.)threads\.net$/];

/** Campaign id if it is on our list (case-insensitive), else null. */
export function knownCampaign(v: unknown): Campaign | null {
  if (typeof v !== "string") return null;
  const s = v.trim().toLowerCase();
  return (CAMPAIGNS as readonly string[]).includes(s) ? (s as Campaign) : null;
}

/** Channel label from a campaign id and/or a referrer HOST (never a full URL). */
export function channelOf(input: { campaign?: unknown; refHost?: unknown; ownHost?: string }): string | null {
  const c = knownCampaign(input.campaign);
  if (c) return c;
  if (typeof input.campaign === "string" && input.campaign.trim()) return "other";
  const host = typeof input.refHost === "string" ? input.refHost.trim().toLowerCase() : "";
  if (!host || !/^[a-z0-9.-]{1,253}$/.test(host) || host === input.ownHost) return null; // direct / internal
  if (SEARCH.some((r) => r.test(host))) return "search";
  if (SOCIAL.some((r) => r.test(host))) return "social";
  return "other";
}
