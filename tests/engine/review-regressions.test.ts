import { expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { computeChart } from "../../src/server/engine";
const seoul = { label:"Seoul", lat:37.57, lon:126.98, tz:"Asia/Seoul" };
it("supports January 1900 without an unbounded backwards search", () => {
  const source = `const {computeChart}=require('./src/server/engine/chart.ts'); const r=computeChart({birthDate:'1900-01-01',time:{kind:'exact',hhmm:'12:00'},place:${JSON.stringify(seoul)}}); console.log(JSON.stringify(r));`;
  const child = spawnSync(process.execPath, ["--import", "tsx", "--eval", source], { timeout: 8000, encoding:"utf8" });
  expect(child.error).toBeUndefined();
  expect(child.status).toBe(0);
  const result = JSON.parse(child.stdout);
  expect(result.kind).toBe("computed");
  expect(result.chart.pillars.year.stem + result.chart.pillars.year.branch).toBe("己亥");
  expect(result.chart.pillars.month.stem + result.chart.pillars.month.branch).toBe("丙子");
}, 12000);
it("returns the existing nonexistent-time error for a whole skipped civil date", () => {
  expect(computeChart({birthDate:"2011-12-30", time:{kind:"unknown"},
    place:{label:"Apia",lat:-13.83,lon:-171.75,tz:"Pacific/Apia"}}))
    .toEqual({kind:"invalid_input",reason:"nonexistent_local_time"});
});
