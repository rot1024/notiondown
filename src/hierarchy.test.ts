import { describe, it, expect, vi } from "vitest";
import {
  buildRelationTree,
  buildSubpageTree,
  buildBothTree,
  getHierarchyDir,
  getEffectiveSlug,
  computeRelativePath,
} from "./hierarchy.ts";
import type { Post } from "./interfaces.ts";
import type { MinimalNotionClient } from "./notion/index.ts";

function makePost(overrides: Partial<Post> & { id: string; slug: string }): Post {
  return {
    title: overrides.slug,
    date: "2024-01-01",
    createdAt: "2024-01-01T00:00:00Z",
    updatedAt: "2024-01-01T00:00:00Z",
    excerpt: "",
    tags: [],
    rank: 0,
    ...overrides,
  };
}

describe("buildRelationTree", () => {
  it("should treat all posts as roots when no parent relations exist", () => {
    const posts = [
      makePost({ id: "a", slug: "page-a" }),
      makePost({ id: "b", slug: "page-b" }),
      makePost({ id: "c", slug: "page-c" }),
    ];

    const tree = buildRelationTree(posts, "Parent");
    expect(tree.roots).toHaveLength(3);
    expect(tree.nodeMap.size).toBe(3);
    for (const root of tree.roots) {
      expect(root.parentId).toBeNull();
      expect(root.children).toHaveLength(0);
      expect(root.depth).toBe(0);
    }
  });

  it("should build simple parent-child relationships", () => {
    const posts = [
      makePost({ id: "parent", slug: "parent-page" }),
      makePost({
        id: "child",
        slug: "child-page",
        additionalProperties: { Parent: [{ id: "parent" }] },
      }),
    ];

    const tree = buildRelationTree(posts, "Parent");
    expect(tree.roots).toHaveLength(1);
    expect(tree.roots[0].post.id).toBe("parent");
    expect(tree.roots[0].children).toHaveLength(1);
    expect(tree.roots[0].children[0].post.id).toBe("child");
    expect(tree.roots[0].children[0].parentId).toBe("parent");
  });

  it("should handle 3+ levels of nesting", () => {
    const posts = [
      makePost({ id: "root", slug: "root" }),
      makePost({
        id: "level1",
        slug: "level1",
        additionalProperties: { Parent: [{ id: "root" }] },
      }),
      makePost({
        id: "level2",
        slug: "level2",
        additionalProperties: { Parent: [{ id: "level1" }] },
      }),
      makePost({
        id: "level3",
        slug: "level3",
        additionalProperties: { Parent: [{ id: "level2" }] },
      }),
    ];

    const tree = buildRelationTree(posts, "Parent");
    expect(tree.roots).toHaveLength(1);

    const root = tree.roots[0];
    expect(root.post.id).toBe("root");
    expect(root.depth).toBe(0);
    expect(root.pathSegments).toEqual(["root"]);

    const l1 = root.children[0];
    expect(l1.post.id).toBe("level1");
    expect(l1.depth).toBe(1);
    expect(l1.pathSegments).toEqual(["root", "level1"]);

    const l2 = l1.children[0];
    expect(l2.post.id).toBe("level2");
    expect(l2.depth).toBe(2);
    expect(l2.pathSegments).toEqual(["root", "level1", "level2"]);

    const l3 = l2.children[0];
    expect(l3.post.id).toBe("level3");
    expect(l3.depth).toBe(3);
    expect(l3.pathSegments).toEqual(["root", "level1", "level2", "level3"]);
  });

  it("should detect and break circular references", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const posts = [
      makePost({
        id: "a",
        slug: "page-a",
        additionalProperties: { Parent: [{ id: "b" }] },
      }),
      makePost({
        id: "b",
        slug: "page-b",
        additionalProperties: { Parent: [{ id: "a" }] },
      }),
    ];

    const tree = buildRelationTree(posts, "Parent");
    // At least one should be treated as root to break the cycle
    expect(tree.roots.length).toBeGreaterThanOrEqual(1);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("circular reference"),
    );

    warnSpy.mockRestore();
  });

  it("should treat orphan pages (parent not in list) as roots", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const posts = [
      makePost({
        id: "orphan",
        slug: "orphan",
        additionalProperties: { Parent: [{ id: "nonexistent" }] },
      }),
    ];

    const tree = buildRelationTree(posts, "Parent");
    expect(tree.roots).toHaveLength(1);
    expect(tree.roots[0].post.id).toBe("orphan");
    expect(tree.roots[0].parentId).toBeNull();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("not in the post list"),
    );

    warnSpy.mockRestore();
  });

  it("should resolve slug duplicates among siblings", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const posts = [
      makePost({ id: "parent", slug: "parent" }),
      makePost({
        id: "aaaa-bbbb-cccc-dddd",
        slug: "same-slug",
        additionalProperties: { Parent: [{ id: "parent" }] },
      }),
      makePost({
        id: "eeee-ffff-0000-1111",
        slug: "same-slug",
        additionalProperties: { Parent: [{ id: "parent" }] },
      }),
    ];

    const tree = buildRelationTree(posts, "Parent");
    const parent = tree.roots[0];
    const childSlugs = parent.children.map((c) => c.post.slug);
    // Both should have unique slugs now
    expect(new Set(childSlugs).size).toBe(2);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("duplicate slug"),
    );

    warnSpy.mockRestore();
  });

  it("should compute pathSegments correctly", () => {
    const posts = [
      makePost({ id: "guide", slug: "guide" }),
      makePost({
        id: "getting-started",
        slug: "getting-started",
        additionalProperties: { Parent: [{ id: "guide" }] },
      }),
      makePost({
        id: "advanced",
        slug: "advanced",
        additionalProperties: { Parent: [{ id: "guide" }] },
      }),
      makePost({
        id: "tips",
        slug: "tips",
        additionalProperties: { Parent: [{ id: "advanced" }] },
      }),
    ];

    const tree = buildRelationTree(posts, "Parent");

    expect(tree.nodeMap.get("guide")!.pathSegments).toEqual(["guide"]);
    expect(tree.nodeMap.get("getting-started")!.pathSegments).toEqual([
      "guide",
      "getting-started",
    ]);
    expect(tree.nodeMap.get("advanced")!.pathSegments).toEqual([
      "guide",
      "advanced",
    ]);
    expect(tree.nodeMap.get("tips")!.pathSegments).toEqual([
      "guide",
      "advanced",
      "tips",
    ]);
  });

  it("should update post.parentId, pathSegments, and childIds", () => {
    const posts = [
      makePost({ id: "root", slug: "root" }),
      makePost({
        id: "child1",
        slug: "child1",
        additionalProperties: { Parent: [{ id: "root" }] },
      }),
      makePost({
        id: "child2",
        slug: "child2",
        additionalProperties: { Parent: [{ id: "root" }] },
      }),
    ];

    const tree = buildRelationTree(posts, "Parent");

    const rootPost = posts.find((p) => p.id === "root")!;
    expect(rootPost.parentId).toBeNull();
    expect(rootPost.childIds).toContain("child1");
    expect(rootPost.childIds).toContain("child2");
    expect(rootPost.pathSegments).toEqual(["root"]);

    const child1Post = posts.find((p) => p.id === "child1")!;
    expect(child1Post.parentId).toBe("root");
    expect(child1Post.childIds).toEqual([]);
    expect(child1Post.pathSegments).toEqual(["root", "child1"]);
  });

  it("should use post.parentId when already set (by buildPost)", () => {
    const posts = [
      makePost({ id: "root", slug: "root" }),
      makePost({
        id: "child",
        slug: "child",
        parentId: "root",
      }),
    ];

    const tree = buildRelationTree(posts, "Parent");
    expect(tree.roots).toHaveLength(1);
    expect(tree.roots[0].post.id).toBe("root");
    expect(tree.roots[0].children).toHaveLength(1);
    expect(tree.roots[0].children[0].post.id).toBe("child");
  });

  it("should warn when multiple parents exist and use the first", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const posts = [
      makePost({ id: "parent1", slug: "parent1" }),
      makePost({ id: "parent2", slug: "parent2" }),
      makePost({
        id: "child",
        slug: "child",
        additionalProperties: {
          Parent: [{ id: "parent1" }, { id: "parent2" }],
        },
      }),
    ];

    const tree = buildRelationTree(posts, "Parent");
    const childNode = tree.nodeMap.get("child")!;
    expect(childNode.parentId).toBe("parent1");
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("multiple parents"),
    );

    warnSpy.mockRestore();
  });
});

describe("getHierarchyDir", () => {
  it("should return empty string for root leaf pages", () => {
    const posts = [makePost({ id: "leaf", slug: "leaf" })];
    const tree = buildRelationTree(posts, "Parent");
    expect(getHierarchyDir("leaf", tree)).toBe("");
  });

  it("should return slug/ for root pages with children", () => {
    const posts = [
      makePost({ id: "parent", slug: "guide" }),
      makePost({
        id: "child",
        slug: "child",
        additionalProperties: { Parent: [{ id: "parent" }] },
      }),
    ];
    const tree = buildRelationTree(posts, "Parent");
    expect(getHierarchyDir("parent", tree)).toBe("guide/");
  });

  it("should return parent path for leaf child pages", () => {
    const posts = [
      makePost({ id: "parent", slug: "guide" }),
      makePost({
        id: "child",
        slug: "intro",
        additionalProperties: { Parent: [{ id: "parent" }] },
      }),
    ];
    const tree = buildRelationTree(posts, "Parent");
    expect(getHierarchyDir("child", tree)).toBe("guide/");
  });

  it("should return nested path for intermediate pages with children", () => {
    const posts = [
      makePost({ id: "root", slug: "guide" }),
      makePost({
        id: "mid",
        slug: "advanced",
        additionalProperties: { Parent: [{ id: "root" }] },
      }),
      makePost({
        id: "leaf",
        slug: "tips",
        additionalProperties: { Parent: [{ id: "mid" }] },
      }),
    ];
    const tree = buildRelationTree(posts, "Parent");
    expect(getHierarchyDir("mid", tree)).toBe("guide/advanced/");
    expect(getHierarchyDir("leaf", tree)).toBe("guide/advanced/");
  });

  it("should return empty string for unknown post ID", () => {
    const posts = [makePost({ id: "a", slug: "a" })];
    const tree = buildRelationTree(posts, "Parent");
    expect(getHierarchyDir("nonexistent", tree)).toBe("");
  });
});

describe("getEffectiveSlug", () => {
  it("should return original slug for leaf pages", () => {
    const posts = [makePost({ id: "leaf", slug: "my-page" })];
    const tree = buildRelationTree(posts, "Parent");
    expect(getEffectiveSlug("leaf", tree)).toBe("my-page");
  });

  it("should return 'index' for pages with children", () => {
    const posts = [
      makePost({ id: "parent", slug: "guide" }),
      makePost({
        id: "child",
        slug: "child",
        additionalProperties: { Parent: [{ id: "parent" }] },
      }),
    ];
    const tree = buildRelationTree(posts, "Parent");
    expect(getEffectiveSlug("parent", tree)).toBe("index");
  });

  it("should return empty string for unknown post ID", () => {
    const posts = [makePost({ id: "a", slug: "a" })];
    const tree = buildRelationTree(posts, "Parent");
    expect(getEffectiveSlug("nonexistent", tree)).toBe("");
  });
});

describe("buildSubpageTree", () => {
  it("should discover child pages and add them to the tree", async () => {
    const posts = [makePost({ id: "parent-page", slug: "parent" })];

    const mockClient: MinimalNotionClient = {
      blocks: {
        children: {
          list: vi.fn().mockImplementation(async ({ block_id }) => {
            if (block_id === "parent-page") {
              return {
                results: [
                  {
                    id: "child-page",
                    type: "child_page",
                    child_page: { title: "Child Page" },
                  },
                ],
                has_more: false,
              };
            }
            return { results: [], has_more: false };
          }),
        },
      },
      dataSources: {
        retrieve: vi.fn(),
        query: vi.fn(),
      },
      pages: {
        retrieve: vi.fn().mockImplementation(async ({ page_id }) => {
          if (page_id === "child-page") {
            return {
              id: "child-page",
              object: "page",
              created_time: "2024-01-01T00:00:00Z",
              last_edited_time: "2024-01-01T00:00:00Z",
              properties: {},
            };
          }
          throw new Error("Not found");
        }),
      },
    };

    const tree = await buildSubpageTree(posts, mockClient);
    expect(tree.roots).toHaveLength(1);
    expect(tree.roots[0].post.id).toBe("parent-page");
    expect(tree.roots[0].children).toHaveLength(1);
    expect(tree.roots[0].children[0].post.id).toBe("child-page");
    expect(tree.roots[0].children[0].post.slug).toBe("child-page");
    // Child page should also be added to posts array
    expect(posts).toHaveLength(2);
    expect(posts[1].id).toBe("child-page");
  });

  it("should use parent date/tags as fallback for child pages without DB properties", async () => {
    const parentPost = makePost({
      id: "parent",
      slug: "parent",
      date: "2024-06-15",
      tags: [{ id: "t1", name: "tag1" }],
    });
    const posts = [parentPost];

    const mockClient: MinimalNotionClient = {
      blocks: {
        children: {
          list: vi.fn().mockImplementation(async ({ block_id }) => {
            if (block_id === "parent") {
              return {
                results: [
                  {
                    id: "child",
                    type: "child_page",
                    child_page: { title: "My Child" },
                  },
                ],
                has_more: false,
              };
            }
            return { results: [], has_more: false };
          }),
        },
      },
      dataSources: {
        retrieve: vi.fn(),
        query: vi.fn(),
      },
      pages: {
        retrieve: vi.fn().mockResolvedValue({
          id: "child",
          object: "page",
          created_time: "2024-06-15T00:00:00Z",
          last_edited_time: "2024-06-15T00:00:00Z",
          properties: {},
        }),
      },
    };

    const tree = await buildSubpageTree(posts, mockClient);
    const childPost = posts.find((p) => p.id === "child")!;
    expect(childPost.date).toBe("2024-06-15");
    expect(childPost.tags).toEqual([{ id: "t1", name: "tag1" }]);
  });
});

describe("buildBothTree", () => {
  it("should combine relation and subpage hierarchies", async () => {
    const posts = [
      makePost({ id: "root", slug: "root" }),
      makePost({
        id: "section",
        slug: "section",
        additionalProperties: { Parent: [{ id: "root" }] },
      }),
    ];

    const mockClient: MinimalNotionClient = {
      blocks: {
        children: {
          list: vi.fn().mockImplementation(async ({ block_id }) => {
            if (block_id === "section") {
              return {
                results: [
                  {
                    id: "subpage",
                    type: "child_page",
                    child_page: { title: "Subpage Content" },
                  },
                ],
                has_more: false,
              };
            }
            return { results: [], has_more: false };
          }),
        },
      },
      dataSources: {
        retrieve: vi.fn(),
        query: vi.fn(),
      },
      pages: {
        retrieve: vi.fn().mockResolvedValue({
          id: "subpage",
          object: "page",
          created_time: "2024-01-01T00:00:00Z",
          last_edited_time: "2024-01-01T00:00:00Z",
          properties: {},
        }),
      },
    };

    const tree = await buildBothTree(posts, "Parent", mockClient);

    expect(tree.roots).toHaveLength(1);
    expect(tree.roots[0].post.id).toBe("root");

    const section = tree.roots[0].children.find(
      (c) => c.post.id === "section",
    )!;
    expect(section).toBeDefined();
    expect(section.children).toHaveLength(1);
    expect(section.children[0].post.id).toBe("subpage");

    // Verify paths
    expect(section.children[0].pathSegments).toEqual([
      "root",
      "section",
      "subpage-content",
    ]);
  });
});

describe("computeRelativePath", () => {
  // Build a tree for reuse:
  // root (has children: section, leaf-at-root)
  //   section (has children: child-a, child-b)
  //     child-a (leaf)
  //     child-b (leaf)
  //   leaf-at-root (leaf, but sibling of section under root)
  // standalone (root leaf, no children)
  function buildTestTree() {
    const posts = [
      makePost({ id: "root", slug: "root" }),
      makePost({
        id: "section",
        slug: "section",
        additionalProperties: { Parent: [{ id: "root" }] },
      }),
      makePost({
        id: "child-a",
        slug: "child-a",
        additionalProperties: { Parent: [{ id: "section" }] },
      }),
      makePost({
        id: "child-b",
        slug: "child-b",
        additionalProperties: { Parent: [{ id: "section" }] },
      }),
      makePost({
        id: "leaf-at-root",
        slug: "leaf-at-root",
        additionalProperties: { Parent: [{ id: "root" }] },
      }),
      makePost({ id: "standalone", slug: "standalone" }),
    ];
    const tree = buildRelationTree(posts, "Parent");
    return { posts, tree };
  }

  it("should compute relative path between siblings", () => {
    const { posts, tree } = buildTestTree();
    const childA = posts.find((p) => p.id === "child-a")!;
    const childB = posts.find((p) => p.id === "child-b")!;

    // child-a is at root/section/child-a (dir: root/section/)
    // child-b is at root/section/child-b (dir: root/section/)
    // From child-a to child-b: same directory → "child-b"
    expect(computeRelativePath(childA, childB, tree)).toBe("child-b");
  });

  it("should compute relative path from leaf to parent (index) page", () => {
    const { posts, tree } = buildTestTree();
    const childA = posts.find((p) => p.id === "child-a")!;
    const section = posts.find((p) => p.id === "section")!;

    // child-a is at root/section/child-a.md (dir: root/section/)
    // section is at root/section/index.md (dir: root/section/)
    // From child-a to section (index): same directory → "."
    expect(computeRelativePath(childA, section, tree)).toBe(".");
  });

  it("should compute relative path from parent to child", () => {
    const { posts, tree } = buildTestTree();
    const section = posts.find((p) => p.id === "section")!;
    const childA = posts.find((p) => p.id === "child-a")!;

    // section is at root/section/index.md (dir: root/section/)
    // child-a is at root/section/child-a.md (dir: root/section/)
    // From section to child-a: same directory → "child-a"
    expect(computeRelativePath(section, childA, tree)).toBe("child-a");
  });

  it("should compute relative path across different branches", () => {
    const { posts, tree } = buildTestTree();
    const childA = posts.find((p) => p.id === "child-a")!;
    const leafAtRoot = posts.find((p) => p.id === "leaf-at-root")!;

    // child-a is at root/section/child-a.md (dir: root/section/)
    // leaf-at-root is at root/leaf-at-root.md (dir: root/)
    // From child-a to leaf-at-root: go up one → "../leaf-at-root"
    expect(computeRelativePath(childA, leafAtRoot, tree)).toBe(
      "../leaf-at-root",
    );
  });

  it("should compute relative path from root leaf to nested page", () => {
    const { posts, tree } = buildTestTree();
    const standalone = posts.find((p) => p.id === "standalone")!;
    const childA = posts.find((p) => p.id === "child-a")!;

    // standalone is at standalone.md (dir: "")
    // child-a is at root/section/child-a.md (dir: root/section/)
    // From standalone to child-a: "root/section/child-a"
    expect(computeRelativePath(standalone, childA, tree)).toBe(
      "root/section/child-a",
    );
  });

  it("should return absolute-style path when fromPost is undefined", () => {
    const { posts, tree } = buildTestTree();
    const childA = posts.find((p) => p.id === "child-a")!;

    expect(computeRelativePath(undefined, childA, tree)).toBe(
      "root/section/child-a",
    );
  });

  it("should link to directory for index pages", () => {
    const { posts, tree } = buildTestTree();
    const standalone = posts.find((p) => p.id === "standalone")!;
    const root = posts.find((p) => p.id === "root")!;

    // standalone is at standalone.md (dir: "")
    // root is at root/index.md (dir: root/) — index page
    // From standalone to root: "root"
    expect(computeRelativePath(standalone, root, tree)).toBe("root");
  });
});
