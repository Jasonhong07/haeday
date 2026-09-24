// Transactional email copy (US English). All dynamic values are escaped; no birth data in email bodies.
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function wrap(title: string, bodyHtml: string, support: string): string {
  return `<!doctype html><html><body style="margin:0;background:#F3EBDD;font-family:Georgia,serif;color:#1E1B16">
<div style="max-width:560px;margin:0 auto;padding:32px 24px">
<p style="font-size:20px;margin:0 0 24px">&#9790; Haeday</p>
<h1 style="font-weight:400;font-size:26px;margin:0 0 16px">${esc(title)}</h1>
${bodyHtml}
<p style="font-size:13px;color:#6b6358;margin-top:32px">Questions? Reply to this email or write to ${esc(support)}.<br>For entertainment and reflection. Not a prediction or professional advice.</p>
</div></body></html>`;
}

export function deliveryEmail(link: string, support: string) {
  const subject = "Your Haeday reading is ready";
  const html = wrap("Your reading is ready", `<p style="font-size:16px;line-height:1.6">Thank you for your purchase. Your personal saju reading is waiting for you.</p>
<p><a href="${esc(link)}" style="display:inline-block;background:#12132A;color:#F2ECE0;padding:14px 22px;border-radius:12px;text-decoration:none">Open my reading</a></p>
<p style="font-size:14px;color:#6b6358">If the link asks you to sign in, use this email address.</p>`, support);
  const text = `Your Haeday reading is ready.\n\nOpen it here: ${link}\n\nIf the link asks you to sign in, use this email address.\n\nQuestions? Reply to this email or write to ${support}.\nFor entertainment and reflection. Not a prediction or professional advice.`;
  return { subject, html, text };
}

export function apologyEmail(support: string) {
  const subject = "We couldn't complete your Haeday reading";
  const html = wrap("We're sorry", `<p style="font-size:16px;line-height:1.6">We couldn't complete your reading this time, so we've started a full refund of your payment. Banks usually show it within 5–10 business days.</p>
<p style="font-size:16px;line-height:1.6">You're welcome to try again any time.</p>`, support);
  const text = `We couldn't complete your Haeday reading this time, so we've started a full refund. Banks usually show it within 5-10 business days.\n\nQuestions? Reply to this email or write to ${support}.`;
  return { subject, html, text };
}

/** Free (100% promotion code) order that could not be completed: nothing was charged, so no refund is mentioned. */
export function apologyFreeEmail(support: string) {
  const subject = "We couldn't complete your Haeday reading";
  const html = wrap("We're sorry", `<p style="font-size:16px;line-height:1.6">We couldn't complete your reading this time. Your order was free, so nothing was charged.</p>
<p style="font-size:16px;line-height:1.6">Reply to this email and we'll help you get your reading.</p>`, support);
  const text = `We couldn't complete your Haeday reading this time. Your order was free, so nothing was charged.\n\nReply to this email or write to ${support} and we'll help you get your reading.`;
  return { subject, html, text };
}

export function magicLinkEmail(link: string, support: string) {
  const subject = "Your Haeday sign-in link";
  const html = wrap("Sign in to Haeday", `<p style="font-size:16px;line-height:1.6">Use the button below to sign in. The link works once and expires in 15 minutes.</p>
<p><a href="${esc(link)}" style="display:inline-block;background:#12132A;color:#F2ECE0;padding:14px 22px;border-radius:12px;text-decoration:none">Sign in</a></p>
<p style="font-size:14px;color:#6b6358">If you didn't ask for this, you can ignore this email.</p>`, support);
  const text = `Sign in to Haeday: ${link}\n\nThe link works once and expires in 15 minutes. If you didn't ask for this, ignore this email.`;
  return { subject, html, text };
}

/** C4: the free chart, emailed at the visitor's request (transactional; no marketing content). */
export function chartEmail(c: { dayMaster: string; image: string; pillars: string }, origin: string, support: string) {
  const esc = (x: string) => x.replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]!));
  const subject = "Your Haeday birth chart";
  const html = wrap("Your birth chart", `<p style="font-size:16px;line-height:1.6">Your Day Master: <b>${esc(c.dayMaster)}</b>, ${esc(c.image)}.</p>
<p style="font-size:16px;line-height:1.6">Your four pillars (hour · day · month · year): <b>${esc(c.pillars)}</b></p>
<p style="font-size:16px;line-height:1.6"><a href="${origin}/saju">Open Haeday</a> to see your chart again or get your personal reading.</p>`, support);
  const text = `Your Day Master: ${c.dayMaster}, ${c.image}.\nYour four pillars (hour · day · month · year): ${c.pillars}\n\nOpen Haeday: ${origin}/saju\n\nQuestions? ${support}`;
  return { subject, html, text };
}
