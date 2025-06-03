import { describe, expect, test } from "vitest";
import type { MdBlock } from "notion-to-md/build/types";

import { transform } from "./md2md.ts";
import type { Post } from "./interfaces.ts";

describe("toggle block transformation", () => {
  test("should add closing details tag to toggle without children", () => {
    const blocks: MdBlock[] = [
      {
        type: "toggle",
        blockId: "test-toggle-id",
        parent: "<details>\n<summary>Test Toggle</summary>\n\n<!-- toggle-content-start -->\n\n",
        children: [],
      },
    ];

    const result = transform({
      blocks,
      posts: [],
      images: new Map(),
      imageDir: "images",
    });

    expect(result).toHaveLength(1);
    expect(result[0].parent).toBe(
      "<details>\n<summary>Test Toggle</summary>\n\n<!-- toggle-content-start -->\n\n\n\n</details>"
    );
  });

  test("should add closing details tag after last child", () => {
    const blocks: MdBlock[] = [
      {
        type: "toggle",
        blockId: "test-toggle-id",
        parent: "<details>\n<summary>Test Toggle</summary>\n\n<!-- toggle-content-start -->\n\n",
        children: [
          {
            type: "paragraph",
            blockId: "child-1",
            parent: "This is child content",
            children: [],
          },
          {
            type: "paragraph",
            blockId: "child-2",
            parent: "This is more child content",
            children: [],
          },
        ],
      },
    ];

    const result = transform({
      blocks,
      posts: [],
      images: new Map(),
      imageDir: "images",
    });

    expect(result).toHaveLength(1);
    expect(result[0].children).toHaveLength(2);
    expect(result[0].children[1].parent).toBe("This is more child content\n\n</details>");
  });

  test("should not modify non-toggle blocks", () => {
    const blocks: MdBlock[] = [
      {
        type: "paragraph",
        blockId: "test-paragraph-id",
        parent: "This is a regular paragraph",
        children: [],
      },
    ];

    const result = transform({
      blocks,
      posts: [],
      images: new Map(),
      imageDir: "images",
    });

    expect(result).toHaveLength(1);
    expect(result[0].parent).toBe("This is a regular paragraph");
  });

  test("should handle nested toggle blocks", () => {
    const blocks: MdBlock[] = [
      {
        type: "toggle",
        blockId: "outer-toggle",
        parent: "<details>\n<summary>Outer Toggle</summary>\n\n<!-- toggle-content-start -->\n\n",
        children: [
          {
            type: "paragraph",
            blockId: "child-para",
            parent: "Some content",
            children: [],
          },
          {
            type: "toggle",
            blockId: "inner-toggle",
            parent: "<details>\n<summary>Inner Toggle</summary>\n\n<!-- toggle-content-start -->\n\n",
            children: [
              {
                type: "paragraph",
                blockId: "nested-para",
                parent: "Nested content",
                children: [],
              },
            ],
          },
        ],
      },
    ];

    const result = transform({
      blocks,
      posts: [],
      images: new Map(),
      imageDir: "images",
    });

    expect(result).toHaveLength(1);
    expect(result[0].children).toHaveLength(2);

    // Check that inner toggle has closing tag
    const innerToggle = result[0].children[1];
    expect(innerToggle.children[0].parent).toBe("Nested content\n\n</details>");

    // Check that outer toggle has closing tag
    expect(result[0].children[1].parent).toBe(
      "<details>\n<summary>Inner Toggle</summary>\n\n<!-- toggle-content-start -->\n\n\n\n</details>"
    );
  });
});

describe("internal link transformation", () => {
  const mockPosts: Post[] = [
    {
      id: "page-id-1",
      title: "Test Page 1",
      slug: "test-page-1",
      date: "2023-01-01",
      createdAt: "2023-01-01T00:00:00.000Z",
      updatedAt: "2023-01-01T00:00:00.000Z",
      excerpt: "Test excerpt",
      tags: [],
      rank: 0,
    },
    {
      id: "page-id-2",
      title: "Test Page 2",
      slug: "test-page-2",
      date: "2023-01-02",
      createdAt: "2023-01-02T00:00:00.000Z",
      updatedAt: "2023-01-02T00:00:00.000Z",
      excerpt: "Test excerpt 2",
      tags: [],
      rank: 0,
    },
  ];

  test("should transform internal links with default extension (no extension)", () => {
    const blocks: MdBlock[] = [
      {
        type: "link_to_page",
        blockId: "test-link-id",
        parent: "[Test Page 1](page-id-1)",
        children: [],
      },
    ];

    const result = transform({
      blocks,
      posts: mockPosts,
      images: new Map(),
      imageDir: "images",
    });

    expect(result).toHaveLength(1);
    expect(result[0].parent).toBe("[Test Page 1](test-page-1)");
  });

  test("should transform internal links with custom extension function", () => {
    const blocks: MdBlock[] = [
      {
        type: "link_to_page",
        blockId: "test-link-id",
        parent: "[Test Page 2](page-id-2)",
        children: [],
      },
    ];

    const internalLink = (post: Post) => `${post.slug}.html`;

    const result = transform({
      blocks,
      posts: mockPosts,
      images: new Map(),
      imageDir: "images",
      internalLink,
    });

    expect(result).toHaveLength(1);
    expect(result[0].parent).toBe("[Test Page 2](test-page-2.html)");
  });

  test("should not transform links to non-existent pages", () => {
    const blocks: MdBlock[] = [
      {
        type: "link_to_page",
        blockId: "test-link-id",
        parent: "[Non-existent Page](non-existent-id)",
        children: [],
      },
    ];

    const result = transform({
      blocks,
      posts: mockPosts,
      images: new Map(),
      imageDir: "images",
    });

    expect(result).toHaveLength(1);
    expect(result[0].parent).toBe("[Non-existent Page](non-existent-id)");
  });

  test("should transform multiple internal links in nested structure", () => {
    const blocks: MdBlock[] = [
      {
        type: "paragraph",
        blockId: "para-1",
        parent: "Some text content",
        children: [
          {
            type: "link_to_page",
            blockId: "link-1",
            parent: "[Test Page 1](page-id-1)",
            children: [],
          },
          {
            type: "link_to_page",
            blockId: "link-2",
            parent: "[Test Page 2](page-id-2)",
            children: [],
          },
        ],
      },
    ];

    const internalLink = (post: Post) => `/${post.slug}/`;

    const result = transform({
      blocks,
      posts: mockPosts,
      images: new Map(),
      imageDir: "images",
      internalLink,
    });

    expect(result).toHaveLength(1);
    expect(result[0].children).toHaveLength(2);
    expect(result[0].children[0].parent).toBe("[Test Page 1](/test-page-1/)");
    expect(result[0].children[1].parent).toBe("[Test Page 2](/test-page-2/)");
  });
});
