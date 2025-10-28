import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { CacheClient } from "./cache.ts";
import type { MinimalNotionClient } from "./minimal.ts";
import { type ListBlockChildrenResponse } from "@notionhq/client";
import { type QueryDataSourceResponse } from "@notionhq/client/build/src/api-endpoints";

const emptyListBlock: ListBlockChildrenResponse = {} as any;
const emptyDb: QueryDataSourceResponse = {} as any;

describe("CacheClient purgeCacheById", () => {
  const testDir = "./test-cache";
  let mockClient: MinimalNotionClient;
  let cacheClient: CacheClient;

  beforeEach(async () => {
    // Setup mock client
    mockClient = {
      dataSources: {
        retrieve: async () => ({
          object: "data_source",
          id: "db1",
          created_time: "2021-01-01T00:00:00.000Z",
          last_edited_time: "2021-01-01T00:00:00.000Z",
          created_by: { object: "user", id: "user1" },
          last_edited_by: { object: "user", id: "user1" },
          title: [{ type: "text", text: { content: "Test", link: null }, plain_text: "Test", href: null, annotations: { bold: false, italic: false, strikethrough: false, underline: false, code: false, color: "default" } }],
          description: [],
          is_inline: false,
          properties: {},
          database_parent: { type: "database_id", database_id: "parent" },
          url: "https://notion.so/db1",
          archived: false,
          public_url: null,
          cover: null,
          icon: null,
          in_trash: false,
        }),
        query: async () => emptyDb,
      },
      blocks: {
        children: {
          list: async () => emptyListBlock,
        },
      },
      pages: {
        retrieve: async () => ({ id: "page1", object: "page" }) as any,
      },
    };

    // Ensure test directory exists
    await fs.promises.mkdir(testDir, { recursive: true });

    cacheClient = new CacheClient({
      base: mockClient,
      databaseId: "test-db",
      useFs: true,
      baseDir: testDir,
      debug: false,
    });
  });

  afterEach(async () => {
    // Clean up test directory
    try {
      await fs.promises.rm(testDir, { recursive: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  it("should purge cache for specific ID and its children", async () => {
    // Setup test data
    const parentId = "parent-123";
    const childId1 = "child-456";
    const childId2 = "child-789";

    // Add some cache entries
    cacheClient.parentMap.set(childId1, parentId);
    cacheClient.parentMap.set(childId2, parentId);
    cacheClient.updatedAtMap.set(parentId, new Date());
    cacheClient.updatedAtMap.set(childId1, new Date());
    cacheClient.updatedAtMap.set(childId2, new Date());

    // Add block cache entries
    cacheClient.blockChildrenListCache.set(parentId, emptyListBlock);
    cacheClient.blockChildrenListCache.set(childId1, emptyListBlock);
    cacheClient.blockChildrenListCache.set(`${childId2}_cursor1`, emptyListBlock);

    // Create some cache files
    await fs.promises.writeFile(
      path.join(testDir, `blocks-${parentId}.json`),
      JSON.stringify({ results: [] })
    );
    await fs.promises.writeFile(
      path.join(testDir, `blocks-${childId1}.json`),
      JSON.stringify({ results: [] })
    );
    await fs.promises.writeFile(
      path.join(testDir, `blocks-${childId2}_cursor1.json`),
      JSON.stringify({ results: [] })
    );

    // Verify initial state
    expect(cacheClient.parentMap.has(childId1)).toBe(true);
    expect(cacheClient.updatedAtMap.has(parentId)).toBe(true);
    expect(cacheClient.blockChildrenListCache.has(parentId)).toBe(true);

    // Purge cache for parent ID
    await cacheClient.purgeCacheById(parentId);

    // Verify that parent and children caches are removed
    expect(cacheClient.parentMap.has(childId1)).toBe(false);
    expect(cacheClient.parentMap.has(childId2)).toBe(false);
    expect(cacheClient.updatedAtMap.has(parentId)).toBe(false);
    expect(cacheClient.updatedAtMap.has(childId1)).toBe(false);
    expect(cacheClient.updatedAtMap.has(childId2)).toBe(false);
    expect(cacheClient.blockChildrenListCache.has(parentId)).toBe(false);
    expect(cacheClient.blockChildrenListCache.has(childId1)).toBe(false);
    expect(cacheClient.blockChildrenListCache.has(`${childId2}_cursor1`)).toBe(false);

    // Verify that cache files are removed
    const files = await fs.promises.readdir(testDir);
    const blockFiles = files.filter(f => f.startsWith("blocks-"));
    expect(blockFiles).toHaveLength(0);
  });

  it("should work without filesystem", async () => {
    const memoryCache = new CacheClient({
      base: mockClient,
      databaseId: "test-db",
      useFs: false,
      baseDir: testDir,
      debug: false,
    });

    const testId = "test-123";
    memoryCache.updatedAtMap.set(testId, new Date());
    memoryCache.blockChildrenListCache.set(testId, emptyListBlock);

    expect(memoryCache.updatedAtMap.has(testId)).toBe(true);

    await memoryCache.purgeCacheById(testId);

    expect(memoryCache.updatedAtMap.has(testId)).toBe(false);
    expect(memoryCache.blockChildrenListCache.has(testId)).toBe(false);
  });
});
