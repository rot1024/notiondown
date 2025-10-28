import { describe, expect, test } from "vitest";
import type { BlockObjectResponse } from "@notionhq/client/build/src/api-endpoints";

import { toggleTransformer, videoTransformer, audioTransformer } from "./markdown.ts";

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

describe("videoTransformer", () => {
  test("should transform video block with external URL", () => {
    const mockVideoBlock: BlockObjectResponse = {
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
      type: "video",
      video: {
        type: "external",
        external: { url: "https://example.com/video.mp4" },
        caption: [],
      },
    };

    const result = videoTransformer(mockVideoBlock);
    expect(result).toBe("![video](https://example.com/video.mp4)");
  });

  test("should transform video block with file URL", () => {
    const mockVideoBlock: BlockObjectResponse = {
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
      type: "video",
      video: {
        type: "file",
        file: {
          url: "https://s3.amazonaws.com/notion/video.mp4",
          expiry_time: "2023-12-31T23:59:59.000Z",
        },
        caption: [],
      },
    };

    const result = videoTransformer(mockVideoBlock);
    expect(result).toBe("![video](https://s3.amazonaws.com/notion/video.mp4)");
  });

  test("should return false for non-video blocks", () => {
    const mockParagraphBlock: BlockObjectResponse = {
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

    const result = videoTransformer(mockParagraphBlock);
    expect(result).toBe(false);
  });
});

describe("audioTransformer", () => {
  test("should transform audio block with external URL", () => {
    const mockAudioBlock: BlockObjectResponse = {
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
      type: "audio",
      audio: {
        type: "external",
        external: { url: "https://example.com/audio.mp3" },
        caption: [],
      },
    };

    const result = audioTransformer(mockAudioBlock);
    expect(result).toBe("![audio](https://example.com/audio.mp3)");
  });

  test("should transform audio block with file URL", () => {
    const mockAudioBlock: BlockObjectResponse = {
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
      type: "audio",
      audio: {
        type: "file",
        file: {
          url: "https://s3.amazonaws.com/notion/audio.mp3",
          expiry_time: "2023-12-31T23:59:59.000Z",
        },
        caption: [],
      },
    };

    const result = audioTransformer(mockAudioBlock);
    expect(result).toBe("![audio](https://s3.amazonaws.com/notion/audio.mp3)");
  });

  test("should return false for non-audio blocks", () => {
    const mockParagraphBlock: BlockObjectResponse = {
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

    const result = audioTransformer(mockParagraphBlock);
    expect(result).toBe(false);
  });
});