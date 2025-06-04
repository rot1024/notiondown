import type { MdBlock } from "notion-to-md/build/types";

import type { Post } from "./interfaces.ts";
import { fileUrlToAssetUrl } from "./utils.ts";

export type { MdBlock } from "notion-to-md/build/types";

export type MdTransformer = (block: MdBlock) => MdBlock;

export function transform({
  blocks,
  posts,
  images,
  imageDir,
  imageUrlTransform,
  internalLink,
  transformers = [],
}: {
  blocks: MdBlock[],
  posts?: Post[],
  images: Map<string, string>,
  imageDir?: string,
  imageUrlTransform?: (filename: string) => string,
  internalLink?: (post: Post) => string,
  transformers?: MdTransformer[],
}): MdBlock[] {
  const processedBlocks = transformMdBlocks(
    blocks,
    (block) => transformMdImageBlock(block, images, imageDir, imageUrlTransform),
    (block) => transformMdLinkBlock(block, posts, internalLink),
    (block) => transformToggleBlock(block),
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

// transforms image url with expiration time to internal url
function transformMdImageBlock(
  block: MdBlock,
  imageUrls: Map<string, string>,
  imageDir?: string,
  imageUrlTransform?: (filename: string) => string,
): MdBlock {
  if (block.type !== "image") return block;

  const imageMarkdown = block.parent;

  const imageUrl = imageMarkdown.match(/!\[.*?\]\((.+)\)/s)?.[1];
  if (imageUrl) {
    let newUrl: string | undefined;
    
    if (imageUrlTransform) {
      // Use custom transform function if provided
      const defaultUrl = fileUrlToAssetUrl(imageUrl, block.blockId, imageDir);
      if (defaultUrl) {
        // Extract filename from the default URL
        const filename = defaultUrl.split("/").pop() || "";
        newUrl = imageUrlTransform(filename);
      }
    } else {
      // Use default behavior
      newUrl = fileUrlToAssetUrl(imageUrl, block.blockId, imageDir);
    }

    if (newUrl && newUrl !== imageUrl) {
      imageUrls.set(imageUrl, newUrl);
      block.parent = block.parent.replace(imageUrl, newUrl);
    }
  }

  return block;
}

// transforms link_to_page to slug link
function transformMdLinkBlock(
  block: MdBlock,
  posts?: Post[],
  internalLink?: (slug: Post) => string
): MdBlock {
  if (block.type !== "link_to_page") return block;

  const linkMarkdown = block.parent;
  const pageId = linkMarkdown.match(/\[(.*)\]\((.*)\)/)?.[2];
  if (pageId) {
    const post = posts?.find((post) => post.id === pageId);
    if (post) {
      const linkTarget = internalLink ? internalLink(post) : post.slug || post.id;
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
