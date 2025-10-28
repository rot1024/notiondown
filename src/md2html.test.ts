import { expect, test, describe } from "vitest";

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

describe("Shiki syntax highlighting", () => {
  test("should render code blocks with syntax highlighting", async () => {
    const markdown = `
\`\`\`javascript
const greeting = "Hello, World!";
console.log(greeting);
\`\`\`
`;

    const converter = new Md2Html();
    const html = await converter.process(markdown);

    // Check that HTML is not escaped
    expect(html).not.toContain("&lt;");
    expect(html).not.toContain("&gt;");

    // Check Shiki theme is applied
    expect(html).toContain('class="shiki');

    // Check inline styles are present
    expect(html).toContain("style=");
    expect(html).toContain("background-color:");

    // Check code structure
    expect(html).toContain("<pre");
    expect(html).toContain("<code>");
    expect(html).toContain('<span class="line">');
  });

  test("should apply custom theme", async () => {
    const markdown = `
\`\`\`typescript
interface User {
  id: number;
  name: string;
}
\`\`\`
`;

    const converter = new Md2Html({ shikiTheme: "github-light" });
    const html = await converter.process(markdown);

    // Check custom theme is applied
    expect(html).toContain("github-light");
  });

  test("should handle multiple code blocks", async () => {
    const markdown = `
\`\`\`javascript
console.log("First");
\`\`\`

\`\`\`python
print("Second")
\`\`\`
`;

    const converter = new Md2Html();
    const html = await converter.process(markdown);

    // Count pre elements
    const preCount = (html.match(/<pre/g) || []).length;
    expect(preCount).toBe(2);

    // Both should have Shiki styling
    expect(html).toContain('class="shiki');
  });

  test("should handle code blocks without language", async () => {
    const markdown = `
\`\`\`
Plain text without language
\`\`\`
`;

    const converter = new Md2Html();
    const html = await converter.process(markdown);

    // Should still render with Shiki (as "text")
    expect(html).toContain("<pre");
    expect(html).not.toContain("&lt;");
  });

  test("should preserve other markdown features", async () => {
    const markdown = `
# Heading

**Bold text** and *italic text*

\`\`\`javascript
const code = true;
\`\`\`

- List item 1
- List item 2
`;

    const converter = new Md2Html();
    const html = await converter.process(markdown);

    // Check markdown features are preserved
    expect(html).toContain("<h1>");
    expect(html).toContain("<strong>");
    expect(html).toContain("<em>");
    expect(html).toContain("<ul>");
    expect(html).toContain("<li>");

    // Check code is still highlighted
    expect(html).toContain('class="shiki');
  });
});
