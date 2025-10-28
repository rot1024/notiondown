import type { BlockObjectResponse } from "@notionhq/client/build/src/api-endpoints";
import { NotionToMarkdown } from "notion-to-md";
import type { ListBlockChildrenResponseResult } from "notion-to-md/build/types";

import type { MinimalNotionClient } from "../notion/index.ts";

export type { CustomTransformer as NotionBlockTransformer, BlockType } from "notion-to-md/build/types";

function notionToMarkdownFrom(client: MinimalNotionClient): NotionToMarkdown {
  return new NotionToMarkdown({
    notionClient: client as any,
  });
}

function registerTransformers(n2m: NotionToMarkdown): void {
  n2m.setCustomTransformer("image", imageTransformer);
  n2m.setCustomTransformer("toggle", toggleTransformer);

  n2m.setCustomTransformer("embed", (block) => {
    const b = block as BlockObjectResponse;
    if (b.type !== "embed") return false;
    return b.embed.url;
  });

  n2m.setCustomTransformer("video", videoTransformer);
  n2m.setCustomTransformer("audio", audioTransformer);

  n2m.setCustomTransformer("bookmark", (block) => {
    const b = block as BlockObjectResponse;
    if (b.type !== "bookmark") return false;
    return b.bookmark.url;
  });
}

export function newNotionToMarkdown(
  client: MinimalNotionClient,
): NotionToMarkdown {
  const n2m = notionToMarkdownFrom(client);
  registerTransformers(n2m);
  return n2m;
}

export function imageTransformer(
  block: ListBlockChildrenResponseResult,
): string | boolean {
  const b = block as BlockObjectResponse;
  if (b.type !== "image") return false;

  let link = "";
  if (b.image.type === "external") {
    link = b.image.external.url;
  } else if (b.image.type === "file") {
    link = b.image.file.url;
  }

  let alt = "";
  const caption = b.image.caption
    .map((item) => item.plain_text)
    .join("")
    .trim();
  if (caption.length > 0) {
    alt = caption;
  }

  return link ? `![${alt}](${link})` : false;
}

export function toggleTransformer(
  block: ListBlockChildrenResponseResult,
): string | false {
  const b = block as BlockObjectResponse;
  if (b.type !== "toggle") return false;

  // Get the summary text from the toggle's rich text
  const summary = b.toggle.rich_text
    .map((item) => item.plain_text)
    .join("")
    .trim();

  // Return HTML that will be processed as markdown
  // The children will be handled separately by notion-to-md
  return `<details>\n<summary>${summary}</summary>\n\n<!-- toggle-content-start -->\n\n`;
}

export function videoTransformer(
  block: ListBlockChildrenResponseResult,
): string | false {
  const b = block as BlockObjectResponse;
  if (b.type !== "video") return false;

  let link = "";
  if (b.video.type === "external") {
    link = b.video.external.url;
  } else if (b.video.type === "file") {
    link = b.video.file.url;
  }

  return link ? `![video](${link})` : false;
}

export function audioTransformer(
  block: ListBlockChildrenResponseResult,
): string | false {
  const b = block as BlockObjectResponse;
  if (b.type !== "audio") return false;

  let link = "";
  if (b.audio.type === "external") {
    link = b.audio.external.url;
  } else if (b.audio.type === "file") {
    link = b.audio.file.url;
  }

  return link ? `![audio](${link})` : false;
}
