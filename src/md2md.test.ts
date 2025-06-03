import { describe, expect, test } from "vitest";
import type { MdBlock } from "notion-to-md/build/types";

import { transform } from "./md2md.ts";

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