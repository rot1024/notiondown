import { describe, expect, test } from "vitest";
import type { BlockObjectResponse } from "@notionhq/client/build/src/api-endpoints";

import { toggleTransformer } from "./markdown.ts";

describe("toggleTransformer", () => {
  test("should transform toggle block with rich text", () => {
    const mockToggleBlock: BlockObjectResponse = {
      object: "block",
      id: "test-id",
      parent: {
        type: "page_id",
        page_id: "parent-page-id",
      },
      created_time: "2023-01-01T00:00:00.000Z",
      last_edited_time: "2023-01-01T00:00:00.000Z",
      created_by: {
        object: "user",
        id: "user-id",
      },
      last_edited_by: {
        object: "user",
        id: "user-id",
      },
      has_children: true,
      archived: false,
      in_trash: false,
      type: "toggle",
      toggle: {
        rich_text: [
          {
            type: "text",
            text: {
              content: "Click to expand",
              link: null,
            },
            annotations: {
              bold: false,
              italic: false,
              strikethrough: false,
              underline: false,
              code: false,
              color: "default",
            },
            plain_text: "Click to expand",
            href: null,
          },
        ],
        color: "default",
      },
    };

    const result = toggleTransformer(mockToggleBlock);
    
    expect(result).toBe(
      `<details>\n<summary>Click to expand</summary>\n\n<!-- toggle-content-start -->\n\n`
    );
  });

  test("should return false for non-toggle blocks", () => {
    const mockNonToggleBlock: BlockObjectResponse = {
      object: "block",
      id: "test-id",
      parent: {
        type: "page_id",
        page_id: "parent-page-id",
      },
      created_time: "2023-01-01T00:00:00.000Z",
      last_edited_time: "2023-01-01T00:00:00.000Z",
      created_by: {
        object: "user",
        id: "user-id",
      },
      last_edited_by: {
        object: "user",
        id: "user-id",
      },
      has_children: false,
      archived: false,
      in_trash: false,
      type: "paragraph",
      paragraph: {
        rich_text: [
          {
            type: "text",
            text: {
              content: "This is a paragraph",
              link: null,
            },
            annotations: {
              bold: false,
              italic: false,
              strikethrough: false,
              underline: false,
              code: false,
              color: "default",
            },
            plain_text: "This is a paragraph",
            href: null,
          },
        ],
        color: "default",
      },
    };

    const result = toggleTransformer(mockNonToggleBlock);
    
    expect(result).toBe(false);
  });

  test("should handle empty rich text", () => {
    const mockToggleBlock: BlockObjectResponse = {
      object: "block",
      id: "test-id",
      parent: {
        type: "page_id",
        page_id: "parent-page-id",
      },
      created_time: "2023-01-01T00:00:00.000Z",
      last_edited_time: "2023-01-01T00:00:00.000Z",
      created_by: {
        object: "user",
        id: "user-id",
      },
      last_edited_by: {
        object: "user",
        id: "user-id",
      },
      has_children: true,
      archived: false,
      in_trash: false,
      type: "toggle",
      toggle: {
        rich_text: [],
        color: "default",
      },
    };

    const result = toggleTransformer(mockToggleBlock);
    
    expect(result).toBe(
      `<details>\n<summary></summary>\n\n<!-- toggle-content-start -->\n\n`
    );
  });
});