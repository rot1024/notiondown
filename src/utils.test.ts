import { expect, test } from "vitest";

import { fileUrlToAssetUrl } from "./utils.ts";

test("fileUrlToAssetUrl", () => {
  expect(
    fileUrlToAssetUrl("https://example.com/image.png?X-Amz-Expires=1", "", "/static"),
  ).toBe("/static/image.webp");
  expect(
    fileUrlToAssetUrl(
      "https://example.com/image.png?X-Amz-Expires=1",
      "blockId",
      "/static",
    ),
  ).toBe("/static/blockId.webp");

  expect(
    fileUrlToAssetUrl("https://example.com/foobar?X-Amz-Expires=1", "blockId", "/static"),
  ).toBe("/static/blockId.webp");
  expect(
    fileUrlToAssetUrl("https://example.com/foobar?X-Amz-Expires=1", "", "/static"),
  ).toBe("/static/foobar");

  expect(
    fileUrlToAssetUrl(
      "https://images.unsplash.com/photo-1514519273132-6a1abd48302c?ixlib=rb-4.0.3&q=85&fm=jpg&crop=entropy&cs=srgb&w=6000",
      "blockId",
      "/static",
    ),
  ).toBe("/static/blockId.webp");
  expect(
    fileUrlToAssetUrl(
      "https://images.unsplash.com/photo-1514519273132-6a1abd48302c?ixlib=rb-4.0.3&q=85&fm=jpg&crop=entropy&cs=srgb&w=6000",
      "",
      "/static",
    ),
  ).toBe("/static/photo-1514519273132-6a1abd48302c");

  expect(fileUrlToAssetUrl("https://example.com", "blockId")).toBeUndefined();
  expect(fileUrlToAssetUrl("https://example.com", "")).toBeUndefined();
  expect(fileUrlToAssetUrl(undefined, "blockId")).toBeUndefined();
  expect(fileUrlToAssetUrl(undefined, "")).toBeUndefined();
});
