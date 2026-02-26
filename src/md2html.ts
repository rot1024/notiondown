import rehypeFigure from "@microflash/rehype-figure";
import remarkEmbedder from "@remark-embedder/core";
import type { Element, Text, Root, ElementContent } from "hast";
import { h } from "hastscript";
import { fromHtml } from "hast-util-from-html";
import isUrl from "is-url";
import type { Root as MdRoot, Paragraph, PhrasingContent, Node } from "mdast";
import rehypeExternalLinks from "rehype-external-links";
import rehypeKatex from "rehype-katex";
import rehypeRaw from "rehype-raw";
import rehypeStringify from "rehype-stringify";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import {
  codeToHtml,
  createHighlighter,
  type Highlighter,
  type BundledLanguage,
  type BundledTheme,
} from "shiki";
import { type Processor, unified } from "unified";
import { visit } from "unist-util-visit";

import { transformers } from "./embed.ts";

export type UnifiedProcessor = Processor<any, any, any, any, any>;

export interface Md2HtmlOptions {
  /** Custom unified processor */
  custom?: UnifiedProcessor;
  /** Shiki theme for code highlighting (default: "github-dark") */
  shikiTheme?: BundledTheme;
}

export class Md2Html {
  u: UnifiedProcessor;
  private highlighter?: Highlighter;

  constructor(options?: Md2HtmlOptions) {
    if (options?.custom) {
      this.u = options.custom;
      return;
    }

    const theme = options?.shikiTheme ?? "github-dark";

    const u = unified()
      .use(remarkParse)
      .use(cjkEmphasis)
      .use(remarkGfm)
      .use(remarkMath)
      .use((remarkEmbedder as any).default as typeof remarkEmbedder, {
        transformers,
      })
      .use(remarkRehype, { allowDangerousHtml: true })
      .use(rehypeRaw)
      .use(rehypeKatex, {
        strict: false, // Allow Unicode text in math mode (common in Notion content with Japanese)
      })
      .use(() => this.rehypeShiki(theme))
      .use(rehypeFigure)
      .use(autoLinkForFigcaption)
      .use(rehypeExternalLinks, {
        target: "_blank",
        rel: ["noopener", "noreferrer"],
      })
      .use(rehypeStringify);

    this.u = u;
  }

  private rehypeShiki(theme: BundledTheme) {
    return async (tree: Root) => {
      if (!this.highlighter) {
        this.highlighter = await createHighlighter({
          themes: [theme],
          langs: [],
        });
      }

      const promises: Promise<void>[] = [];

      visit(tree, "element", (node: Element) => {
        if (node.tagName !== "pre") return;

        const codeElement = node.children.find(
          (child): child is Element =>
            child.type === "element" && child.tagName === "code",
        );

        if (!codeElement) return;

        const className = codeElement.properties?.className as
          | string[]
          | undefined;
        const languageClass = className?.find((c) =>
          c.startsWith("language-"),
        );
        const language = languageClass?.replace("language-", "") ?? "text";

        const codeText = codeElement.children
          .filter((child): child is Text => child.type === "text")
          .map((child) => child.value)
          .join("");

        const promise = (async () => {
          try {
            await this.highlighter!.loadLanguage(language as BundledLanguage);
            const html = await this.highlighter!.codeToHtml(codeText, {
              lang: language,
              theme: theme,
            });

            // Parse Shiki's HTML and convert to Hast structure
            const parsed = fromHtml(html, { fragment: true });

            // Extract the <pre> element from parsed HTML
            const preElement = parsed.children.find(
              (child): child is Element =>
                child.type === "element" && child.tagName === "pre"
            );

            if (preElement) {
              // Replace node properties and children with Shiki's output
              node.properties = preElement.properties;
              node.children = preElement.children as ElementContent[];
            }
          } catch (error) {
            // If language is not supported, keep the original code block
            console.warn(`Shiki: Language "${language}" not supported`, error);
          }
        })();

        promises.push(promise);
      });

      await Promise.all(promises);
    };
  }

  async process(md: string): Promise<string> {
    return String(await this.u.process(md));
  }
}

function cjkEmphasis() {
  return (tree: MdRoot) => {
    visit(tree, "text", (node) => {
      const match = node.value.match(
        /\*([^*]+)\*|\*\*([^*]+)\*\*|_([^*]+)_|__([^*]+)__/g,
      );
      if (!match) return;

      const children = match.reduce<PhrasingContent[]>((acc, m) => {
        const strongOrEm =
          m.startsWith("**") || m.startsWith("__") ? "strong" : "emphasis";
        const strongOrEmLen = strongOrEm === "strong" ? 2 : 1;
        const text = m.slice(strongOrEmLen, -strongOrEmLen);
        const index = node.value.indexOf(m);
        if (index > 0) {
          acc.push({
            type: "text",
            value: node.value.slice(0, index),
          });
        }
        acc.push({
          type: strongOrEm,
          children: [{ type: "text", value: text }],
        });
        node.value = node.value.slice(index + m.length);
        return acc;
      }, []);

      if (node.value.length > 0) {
        children.push({ type: "text", value: node.value });
      }

      const pnode = node as unknown as Paragraph;
      delete (node as any).value;
      pnode.type = "paragraph";
      pnode.children = children;
    });
  };
}

function autoLinkForFigcaption() {
  return (tree: Root) => {
    visit(
      tree,
      { type: "element", tagName: "figcaption" },
      (figcaption: Element) => {
        figcaption.children.forEach((element) => {
          if (element.type !== "text" && element.type !== "element") return;

          visit(element, "text", (node, index, parent) => {
            const words = node.value.split(/(\s+)/);
            const children = words.map((word) => {
              if (isUrl(word)) {
                return h("a", { href: word }, word);
              } else {
                return { type: "text", value: word } satisfies Text;
              }
            });

            if (typeof index === "number" && parent) {
              parent.children.splice(index, 1, ...children);
            } else {
              figcaption.children = children;
            }
          });
        });
      },
    );
  };
}
