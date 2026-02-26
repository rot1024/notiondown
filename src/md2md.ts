import type { MdBlock } from "notion-to-md/build/types";

import type { Post } from "./interfaces.ts";
import { fileUrlToAssetUrl } from "./utils.ts";

export type { MdBlock } from "notion-to-md/build/types";

export type MdTransformer = (block: MdBlock) => MdBlock;

export function transform({
  blocks,
  posts,
  assets,
  assetsDir,
  imageDir, // deprecated, for backward compatibility
  assetUrlTransform,
  imageUrlTransform, // deprecated, for backward compatibility
  internalLink,
  fromPostId,
  transformers = [],
}: {
  blocks: MdBlock[],
  posts?: Post[],
  assets: Map<string, string>,
  assetsDir?: string,
  /** @deprecated Use assetsDir instead */
  imageDir?: string,
  assetUrlTransform?: (filename: string) => string,
  /** @deprecated Use assetUrlTransform instead */
  imageUrlTransform?: (filename: string) => string,
  internalLink?: (post: Post, fromPost?: Post) => string,
  fromPostId?: string,
  transformers?: MdTransformer[],
}): MdBlock[] {
  // Handle backward compatibility
  const dir = assetsDir || imageDir;
  const urlTransform = assetUrlTransform || imageUrlTransform;
  const fromPost = fromPostId ? posts?.find((p) => p.id === fromPostId) : undefined;

  const processedBlocks = transformMdBlocks(
    blocks,
    (block) => transformMdAssetBlock(block, assets, dir, urlTransform),
    (block) => transformMdLinkBlock(block, posts, internalLink, fromPost),
    (block) => transformToggleBlock(block),
    (block) => normalizeSmartQuotes(block),
    (block) => escapeDollarInCurrency(block),
    ...transformers,
  );

  return processToggleCloseTags(processedBlocks);
}

function transformMdBlocks(
  blocks: MdBlock[],
  ...transformers: MdTransformer[]
): MdBlock[] {
  return blocks.map((block) => {
    if (block.children.length > 0) {
      block.children = transformMdBlocks(block.children, ...transformers);
    }

    for (const transformer of transformers) {
      block = transformer(block);
    }
    return block;
  });
}

// transforms asset (image/video/audio) url with expiration time to internal url
function transformMdAssetBlock(
  block: MdBlock,
  assetUrls: Map<string, string>,
  assetsDir?: string,
  assetUrlTransform?: (filename: string) => string,
): MdBlock {
  if (block.type === "image") {
    return transformImageBlock(block, assetUrls, assetsDir, assetUrlTransform);
  } else if (block.type === "video") {
    return transformVideoBlock(block, assetUrls, assetsDir, assetUrlTransform);
  } else if (block.type === "audio") {
    return transformAudioBlock(block, assetUrls, assetsDir, assetUrlTransform);
  }
  return block;
}

function transformImageBlock(
  block: MdBlock,
  assetUrls: Map<string, string>,
  assetsDir?: string,
  assetUrlTransform?: (filename: string) => string,
): MdBlock {
  const imageMarkdown = block.parent;
  const imageUrl = imageMarkdown.match(/!\[.*?\]\((.+)\)/s)?.[1];

  if (imageUrl) {
    let newUrl: string | undefined;

    if (assetUrlTransform) {
      const defaultUrl = fileUrlToAssetUrl(imageUrl, block.blockId, assetsDir);
      if (defaultUrl) {
        const filename = defaultUrl.split("/").pop() || "";
        newUrl = assetUrlTransform(filename);
      }
    } else {
      newUrl = fileUrlToAssetUrl(imageUrl, block.blockId, assetsDir);
    }

    if (newUrl && newUrl !== imageUrl) {
      assetUrls.set(imageUrl, newUrl);
      block.parent = block.parent.replace(imageUrl, newUrl);
    }
  }

  return block;
}

function transformVideoBlock(
  block: MdBlock,
  assetUrls: Map<string, string>,
  assetsDir?: string,
  assetUrlTransform?: (filename: string) => string,
): MdBlock {
  const videoMarkdown = block.parent;
  const videoUrl = videoMarkdown.match(/!\[video\]\((.+)\)/s)?.[1];

  if (videoUrl) {
    let newUrl: string | undefined;

    if (assetUrlTransform) {
      const defaultUrl = fileUrlToAssetUrl(videoUrl, block.blockId, assetsDir);
      if (defaultUrl) {
        const filename = defaultUrl.split("/").pop() || "";
        newUrl = assetUrlTransform(filename);
      }
    } else {
      newUrl = fileUrlToAssetUrl(videoUrl, block.blockId, assetsDir);
    }

    if (newUrl && newUrl !== videoUrl) {
      assetUrls.set(videoUrl, newUrl);
      block.parent = `<video controls>\n  <source src="${newUrl}" type="video/mp4">\n  Your browser does not support the video tag.\n</video>`;
    }
  }

  return block;
}

function transformAudioBlock(
  block: MdBlock,
  assetUrls: Map<string, string>,
  assetsDir?: string,
  assetUrlTransform?: (filename: string) => string,
): MdBlock {
  const audioMarkdown = block.parent;
  const audioUrl = audioMarkdown.match(/!\[audio\]\((.+)\)/s)?.[1];

  if (audioUrl) {
    let newUrl: string | undefined;

    if (assetUrlTransform) {
      const defaultUrl = fileUrlToAssetUrl(audioUrl, block.blockId, assetsDir);
      if (defaultUrl) {
        const filename = defaultUrl.split("/").pop() || "";
        newUrl = assetUrlTransform(filename);
      }
    } else {
      newUrl = fileUrlToAssetUrl(audioUrl, block.blockId, assetsDir);
    }

    if (newUrl && newUrl !== audioUrl) {
      assetUrls.set(audioUrl, newUrl);
      block.parent = `<audio controls>\n  <source src="${newUrl}">\n  Your browser does not support the audio tag.\n</audio>`;
    }
  }

  return block;
}

// transforms link_to_page to slug link
function transformMdLinkBlock(
  block: MdBlock,
  posts?: Post[],
  internalLink?: (post: Post, fromPost?: Post) => string,
  fromPost?: Post,
): MdBlock {
  if (block.type !== "link_to_page") return block;

  const linkMarkdown = block.parent;
  const pageId = linkMarkdown.match(/\[(.*)\]\((.*)\)/)?.[2];
  if (pageId) {
    const post = posts?.find((post) => post.id === pageId);
    if (post) {
      const linkTarget = internalLink ? internalLink(post, fromPost) : post.slug || post.id;
      block.parent = block.parent.replace(pageId, linkTarget);
    }
  }

  return block;
}

// transforms toggle blocks to include child content properly
function transformToggleBlock(block: MdBlock): MdBlock {
  if (block.type !== "toggle") return block;

  // The block should already have the opening <details><summary> tags
  // We need to add the closing tags after all children
  if (block.children.length > 0) {
    // Add closing details tag after processing children
    const lastChild = block.children[block.children.length - 1];
    if (lastChild) {
      lastChild.parent += '\n\n</details>';
    }
  } else {
    // No children, close the details tag immediately
    block.parent += '\n\n</details>';
  }

  return block;
}

// Post-process to ensure toggle tags are properly closed
function processToggleCloseTags(blocks: MdBlock[]): MdBlock[] {
  const result: MdBlock[] = [];

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    result.push(block);

    // If this is a toggle block and it has the opening tag, ensure it's properly closed
    if (block.type === "toggle" && block.parent.includes('<details>')) {
      if (!block.parent.includes('</details>') && block.children.length === 0) {
        block.parent += '\n\n</details>';
      }
    }
  }

  return result;
}

// Normalizes smart quotes to regular quotes to prevent KaTeX warnings
function normalizeSmartQuotes(block: MdBlock): MdBlock {
  // Skip code blocks
  if (block.type === "code") {
    return block;
  }

  let text = block.parent;

  // Replace smart quotes with regular quotes
  text = text.replace(/[""]/g, '"'); // Left and right double quotes → regular double quote
  text = text.replace(/['']/g, "'"); // Left and right single quotes → regular single quote

  block.parent = text;
  return block;
}

// Escapes dollar signs in currency notations to prevent them from being interpreted as math delimiters
function escapeDollarInCurrency(block: MdBlock): MdBlock {
  // Skip code blocks and equation blocks
  if (block.type === "code" || block.type === "equation") {
    return block;
  }

  let text = block.parent;

  // Replace currency dollar signs with escaped version
  // Pattern matches: $followed by a digit, but not when already part of a math expression ($...$)
  // We need to be careful not to break inline math like $x$ or $O(n)$

  // Strategy: Find all $ signs and determine if they're part of a valid math expression or currency
  const dollars: { index: number; isMath: boolean }[] = [];

  for (let i = 0; i < text.length; i++) {
    if (text[i] === '$') {
      dollars.push({ index: i, isMath: false });
    }
  }

  // Mark pairs of $ as math delimiters
  for (let i = 0; i < dollars.length - 1; i += 2) {
    const start = dollars[i].index;
    const end = dollars[i + 1].index;

    // Check if this looks like a math expression
    // Math expressions typically have: $letter or $\ or ${ after opening $
    const afterStart = text[start + 1];
    const beforeEnd = text[end - 1];

    // If starts with digit and contains /, it's likely currency
    if (afterStart && /\d/.test(afterStart)) {
      const segment = text.substring(start, end + 1);
      if (segment.includes('/') || /^\$\d+(\.\d+)?\$/.test(segment)) {
        // This looks like currency in both positions, don't mark as math
        continue;
      }
    }

    // Otherwise, mark as math
    dollars[i].isMath = true;
    dollars[i + 1].isMath = true;
  }

  // Now escape the $ signs that are not math delimiters
  // Build the result string from right to left to preserve indices
  for (let i = dollars.length - 1; i >= 0; i--) {
    const { index, isMath } = dollars[i];

    if (!isMath) {
      // Check if followed by a digit (currency pattern)
      const nextChar = text[index + 1];
      if (nextChar && /\d/.test(nextChar)) {
        text = text.substring(0, index) + '\\$' + text.substring(index + 1);
      }
    }
  }

  block.parent = text;
  return block;
}
