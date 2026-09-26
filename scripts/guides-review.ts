// `pnpm guides:review`: writes docs/CONTENT_REVIEW_GUIDES.md, the full text of every guide page as visitors would
// see it (snippet text included), for Jason's approval. Regenerate after any edit to src/content/guides.ts.
import { writeFileSync } from "node:fs";
import { GUIDES } from "../src/content/guides";
import { isPublished, resolveGuide } from "../src/lib/guides";

const KO: Record<string, string> = {
  "what-is-saju": "사주란 무엇인가: 네 기둥·여덟 글자, 음양오행, 일간, 서양 점성술과의 차이, 시간·장소가 중요한 이유",
  "five-elements": "오행 설명: 목화토금수의 뜻, 상생·상극, 내 명식에서 균형을 보는 법(개수는 강약이 아님)",
  "2027-year-of-the-fire-goat": "2027 정미년: 입춘(2/4) 시작, 丁(촛불)·未(여름 토), 일간별로 다르게 작용, 예언이 아닌 성찰용",
};
let md = `# 가이드 페이지 검토 (SEO용 공개 페이지) · 자동 생성\n\n` +
  `각 페이지는 **페이지 승인** + **인용한 해석 문구(일간 문구) 승인**이 모두 되어야 공개됩니다. 승인 전에는 방문자에게 404, 사이트맵에서도 빠집니다.\n` +
  `관리자로 로그인하면 실제 화면에서 미리 볼 수 있습니다(\`/learn\`).\n\n승인 방법: "가이드 전체 승인" 또는 페이지별 수정 지시.\n\n`;
for (const g of GUIDES) {
  const s = resolveGuide(g)!;
  md += `---\n\n## /learn/${g.slug} · ${isPublished(g) ? "공개" : "초안"}\n\n`;
  md += `> ${KO[g.slug] ?? `일간 페이지: ${g.title.split(":")[0]} (일간 이미지·핵심·연애·일·약점 문구는 CONTENT_REVIEW_KO.md의 일간 문구와 동일)`}\n\n`;
  md += `**Title:** ${g.title}  \n**Description:** ${g.description}\n\n${g.intro}\n\n`;
  for (const sec of s) md += `### ${sec.heading}\n\n${sec.paragraphs.join("\n\n")}\n\n`;
  if (g.faq?.length) md += `### Questions\n\n${g.faq.map((f) => `- **${f.q}** ${f.a}`).join("\n")}\n\n`;
}
writeFileSync("docs/CONTENT_REVIEW_GUIDES.md", md);
console.log(`wrote docs/CONTENT_REVIEW_GUIDES.md (${GUIDES.length} pages)`);
