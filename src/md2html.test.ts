import { expect, test } from "vitest";

import { Md2Html } from "./md2html.ts";

test("markdown strong and em", async () => {
  const md2html = new Md2Html();

  const md = "**「あああ！」**と__AAA！__と";
  const html = await md2html.process(md);
  expect
    .soft(html)
    .toBe(`<p><strong>「あああ！」</strong>と<strong>AAA！</strong>と</p>`);

  const md2 = "_「あああ！」_と*A！*と";
  const html2 = await md2html.process(md2);
  expect.soft(html2).toBe(`<p><em>「あああ！」</em>と<em>A！</em>と</p>`);

  const md3 = "**あああ**と";
  const html3 = await md2html.process(md3);
  expect.soft(html3).toBe(`<p><strong>あああ</strong>と</p>`);
});
