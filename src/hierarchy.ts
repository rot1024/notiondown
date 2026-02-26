import type { Post } from "./interfaces.ts";
import type { MinimalNotionClient } from "./notion/index.ts";
import { buildPost, isValidPage, type PropertyNames } from "./conv.ts";

export type HierarchyMode = "relation" | "subpage" | "both";

export type HierarchyOptions = {
  mode: HierarchyMode;
  /** Relation property name for relation / both mode */
  relationProperty?: string;
};

export type HierarchyNode = {
  post: Post;
  parentId: string | null;
  children: HierarchyNode[];
  pathSegments: string[];
  depth: number;
};

export type HierarchyTree = {
  roots: HierarchyNode[];
  nodeMap: Map<string, HierarchyNode>;
};

/**
 * Build a hierarchy tree from posts using a self-referencing relation property.
 */
export function buildRelationTree(
  posts: Post[],
  relationProperty: string,
): HierarchyTree {
  const nodeMap = new Map<string, HierarchyNode>();

  // Create nodes for all posts
  for (const post of posts) {
    nodeMap.set(post.id, {
      post,
      parentId: null,
      children: [],
      pathSegments: [],
      depth: 0,
    });
  }

  // Establish parent-child relationships
  for (const post of posts) {
    const parentId = getParentIdFromPost(post, relationProperty);
    const node = nodeMap.get(post.id)!;

    if (parentId && nodeMap.has(parentId)) {
      node.parentId = parentId;
    } else if (parentId && !nodeMap.has(parentId)) {
      // Parent not in list (unpublished/filtered out) — treat as root
      console.warn(
        `notiondown: hierarchy: page "${post.title}" (${post.id}) references parent ${parentId} which is not in the post list. Treating as root.`,
      );
      node.parentId = null;
    }
  }

  // Detect circular references
  detectAndBreakCycles(nodeMap);

  // Build the tree structure
  const roots: HierarchyNode[] = [];
  for (const node of nodeMap.values()) {
    if (node.parentId === null) {
      roots.push(node);
    } else {
      const parent = nodeMap.get(node.parentId);
      if (parent) {
        parent.children.push(node);
      }
    }
  }

  // Compute paths and update posts
  computePaths(roots, []);
  resolveSlugDuplicates(roots);
  updatePostsFromTree(nodeMap);

  return { roots, nodeMap };
}

/**
 * Build a hierarchy tree from posts by scanning for child pages (Notion subpages).
 */
export async function buildSubpageTree(
  posts: Post[],
  client: MinimalNotionClient,
  assetsDir?: string,
  propertyNames?: Partial<PropertyNames>,
  additionalProperties?: string[],
): Promise<HierarchyTree> {
  const nodeMap = new Map<string, HierarchyNode>();

  // Create nodes for all existing posts
  for (const post of posts) {
    nodeMap.set(post.id, {
      post,
      parentId: null,
      children: [],
      pathSegments: [],
      depth: 0,
    });
  }

  // Scan each post for child pages
  for (const post of posts) {
    await scanAndAddChildPages(
      post.id,
      nodeMap,
      client,
      posts,
      assetsDir,
      propertyNames,
      additionalProperties,
    );
  }

  // Build roots (pages that have no parent in the tree)
  const roots: HierarchyNode[] = [];
  for (const node of nodeMap.values()) {
    if (node.parentId === null) {
      roots.push(node);
    }
  }

  computePaths(roots, []);
  resolveSlugDuplicates(roots);
  updatePostsFromTree(nodeMap);

  return { roots, nodeMap };
}

/**
 * Build a hierarchy tree using both relation and subpage modes.
 * Phase 1: Build relation tree
 * Phase 2: Scan each node for child pages and add them
 */
export async function buildBothTree(
  posts: Post[],
  relationProperty: string,
  client: MinimalNotionClient,
  assetsDir?: string,
  propertyNames?: Partial<PropertyNames>,
  additionalProperties?: string[],
): Promise<HierarchyTree> {
  // Phase 1: Build relation tree
  const tree = buildRelationTree(posts, relationProperty);

  // Phase 2: Scan each node for child pages
  for (const post of posts) {
    await scanAndAddChildPages(
      post.id,
      tree.nodeMap,
      client,
      posts,
      assetsDir,
      propertyNames,
      additionalProperties,
    );
  }

  // Recompute paths after adding subpages
  const roots: HierarchyNode[] = [];
  for (const node of tree.nodeMap.values()) {
    if (node.parentId === null) {
      roots.push(node);
    }
  }
  tree.roots = roots;

  computePaths(roots, []);
  resolveSlugDuplicates(roots);
  updatePostsFromTree(tree.nodeMap);

  return tree;
}

// --- Helper functions ---

function getParentIdFromPost(post: Post, relationProperty: string): string | null {
  // First check the post-level parentId (set by buildPost when propertyNames.parent is configured)
  if (post.parentId !== undefined) {
    return post.parentId;
  }

  // Fall back to additionalProperties
  const rel = post.additionalProperties?.[relationProperty];
  if (Array.isArray(rel) && rel.length > 0 && rel[0]?.id) {
    if (rel.length > 1) {
      console.warn(
        `notiondown: hierarchy: page "${post.title}" (${post.id}) has multiple parents in "${relationProperty}". Using the first one.`,
      );
    }
    return rel[0].id;
  }
  return null;
}

function detectAndBreakCycles(nodeMap: Map<string, HierarchyNode>): void {
  const visited = new Set<string>();
  const inStack = new Set<string>();

  function dfs(nodeId: string): boolean {
    if (inStack.has(nodeId)) return true; // cycle detected
    if (visited.has(nodeId)) return false;

    visited.add(nodeId);
    inStack.add(nodeId);

    const node = nodeMap.get(nodeId);
    if (node?.parentId) {
      if (dfs(node.parentId)) {
        // Break the cycle at this node
        console.warn(
          `notiondown: hierarchy: circular reference detected involving page "${node.post.title}" (${nodeId}). Treating as root.`,
        );
        node.parentId = null;
      }
    }

    inStack.delete(nodeId);
    return false;
  }

  for (const nodeId of nodeMap.keys()) {
    dfs(nodeId);
  }
}

/**
 * Depth-first traversal to compute pathSegments for each node.
 */
export function computePaths(nodes: HierarchyNode[], parentPath: string[]): void {
  for (const node of nodes) {
    node.pathSegments = [...parentPath, node.post.slug];
    node.depth = node.pathSegments.length - 1;
    computePaths(node.children, node.pathSegments);
  }
}

/**
 * Resolve slug duplicates within the same parent by appending post ID suffix.
 */
function resolveSlugDuplicates(nodes: HierarchyNode[]): void {
  const slugMap = new Map<string, HierarchyNode[]>();
  for (const node of nodes) {
    const slug = node.post.slug;
    if (!slugMap.has(slug)) {
      slugMap.set(slug, []);
    }
    slugMap.get(slug)!.push(node);
  }

  for (const [slug, dupes] of slugMap) {
    if (dupes.length > 1) {
      console.warn(
        `notiondown: hierarchy: duplicate slug "${slug}" found among siblings. Appending post ID suffix.`,
      );
      for (const node of dupes) {
        const shortId = node.post.id.replace(/-/g, "").slice(0, 8);
        node.post.slug = `${slug}-${shortId}`;
        // Recompute pathSegments for this node and its children
        const parentPath = node.pathSegments.slice(0, -1);
        node.pathSegments = [...parentPath, node.post.slug];
        computePaths(node.children, node.pathSegments);
      }
    }
  }

  // Recurse into children
  for (const node of nodes) {
    resolveSlugDuplicates(node.children);
  }
}

/**
 * Update Post objects with hierarchy information from the tree.
 */
function updatePostsFromTree(nodeMap: Map<string, HierarchyNode>): void {
  for (const node of nodeMap.values()) {
    node.post.parentId = node.parentId;
    node.post.pathSegments = node.pathSegments;
    node.post.childIds = node.children.map((child) => child.post.id);
  }
}

/**
 * Get the directory path for a post's output file.
 * - Root pages without children: "" (empty, flat)
 * - Root pages with children: "slug/"
 * - Leaf child pages: "parent-slug/" or "parent/grandparent/"
 * - Intermediate pages with children: "parent-slug/this-slug/"
 */
export function getHierarchyDir(postId: string, tree: HierarchyTree): string {
  const node = tree.nodeMap.get(postId);
  if (!node) return "";

  if (node.children.length > 0) {
    // Page has children — it becomes an index file in its own directory
    return node.pathSegments.join("/") + "/";
  }

  // Leaf page — placed in parent's directory
  if (node.pathSegments.length <= 1) {
    return ""; // root leaf — flat
  }
  return node.pathSegments.slice(0, -1).join("/") + "/";
}

/**
 * Get the effective slug for a post in hierarchy mode.
 * Pages with children become "index" files.
 */
export function getEffectiveSlug(postId: string, tree: HierarchyTree): string {
  const node = tree.nodeMap.get(postId);
  if (!node) return "";

  if (node.children.length > 0) {
    return "index";
  }
  return node.post.slug;
}

/**
 * Compute a relative path from one post's output file to another post's output file.
 * Used for internal links in hierarchy mode.
 *
 * Example: from "guide/index.md" to "guide/advanced/tips.md" → "advanced/tips"
 * Example: from "guide/advanced/tips.md" to "guide/getting-started.md" → "../getting-started"
 * Example: from "guide/index.md" to "blog-post.md" → "../blog-post"
 */
export function computeRelativePath(
  fromPost: Post | undefined,
  toPost: Post,
  tree: HierarchyTree,
): string {
  if (!fromPost) {
    // No source context — fall back to absolute-style path
    return getAbsoluteHierarchyPath(toPost.id, tree);
  }

  const fromDir = getHierarchyDir(fromPost.id, tree);
  const toDir = getHierarchyDir(toPost.id, tree);
  const toSlug = getEffectiveSlug(toPost.id, tree) || toPost.slug || toPost.id;

  // Split directory paths into segments
  const fromParts = fromDir ? fromDir.replace(/\/$/, "").split("/") : [];
  const toParts = toDir ? toDir.replace(/\/$/, "").split("/") : [];

  // Find common prefix length
  let common = 0;
  while (
    common < fromParts.length &&
    common < toParts.length &&
    fromParts[common] === toParts[common]
  ) {
    common++;
  }

  // Build relative path: go up from fromDir, then down to toDir
  const ups = fromParts.length - common;
  const downs = toParts.slice(common);

  const parts: string[] = [];
  for (let i = 0; i < ups; i++) {
    parts.push("..");
  }
  parts.push(...downs);

  // For index files (pages with children), link to the directory
  if (toSlug === "index") {
    const result = parts.join("/");
    return result || ".";
  }

  parts.push(toSlug);
  return parts.join("/") || toSlug;
}

/**
 * Get an absolute-style hierarchy path for a post (used as fallback when no fromPost).
 */
function getAbsoluteHierarchyPath(postId: string, tree: HierarchyTree): string {
  const node = tree.nodeMap.get(postId);
  if (!node) return "";

  if (node.children.length > 0) {
    // Index page — link to its directory path
    return node.pathSegments.join("/");
  }
  return node.pathSegments.join("/");
}

/**
 * Scan a page's blocks for child_page blocks and add them to the tree.
 */
async function scanAndAddChildPages(
  parentId: string,
  nodeMap: Map<string, HierarchyNode>,
  client: MinimalNotionClient,
  posts: Post[],
  assetsDir?: string,
  propertyNames?: Partial<PropertyNames>,
  additionalProperties?: string[],
): Promise<void> {
  const parentNode = nodeMap.get(parentId);
  if (!parentNode) return;

  try {
    const blocksRes = await client.blocks.children.list({
      block_id: parentId,
    });

    for (const block of blocksRes.results) {
      if (!("type" in block) || block.type !== "child_page") continue;

      const childPageId = block.id;

      // Skip if already in the tree
      if (nodeMap.has(childPageId)) {
        // If already exists but without parent, set parent
        const existing = nodeMap.get(childPageId)!;
        if (existing.parentId === null) {
          existing.parentId = parentId;
          parentNode.children.push(existing);
        }
        continue;
      }

      // Try to retrieve the child page and build a Post
      try {
        const pageRes = await client.pages.retrieve({ page_id: childPageId });

        let childPost: Post;
        if (isValidPage(pageRes, propertyNames)) {
          childPost = buildPost(pageRes, assetsDir, propertyNames, additionalProperties);
        } else {
          // Minimal post from child_page block
          const title = block.child_page.title;
          childPost = {
            id: childPageId,
            title,
            slug: slugify(title),
            date: parentNode.post.date,
            createdAt: "created_time" in pageRes ? (pageRes as any).created_time : "",
            updatedAt: "last_edited_time" in pageRes ? (pageRes as any).last_edited_time : "",
            excerpt: "",
            tags: parentNode.post.tags,
            rank: 0,
          };
        }

        const childNode: HierarchyNode = {
          post: childPost,
          parentId,
          children: [],
          pathSegments: [],
          depth: 0,
        };

        nodeMap.set(childPageId, childNode);
        parentNode.children.push(childNode);
        posts.push(childPost);
      } catch {
        console.warn(
          `notiondown: hierarchy: failed to retrieve child page ${childPageId} of "${parentNode.post.title}". Skipping.`,
        );
      }
    }
  } catch {
    // blocks.children.list may fail for pages without content
  }
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/^-+|-+$/g, "")
    || text.toLowerCase().replace(/\s+/g, "-");
}
