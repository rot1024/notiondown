import fs from "node:fs";
import path from "node:path";

import type {
  GetDataSourceResponse,
  GetPageResponse,
  ListBlockChildrenResponse,
  QueryDataSourceResponse,
} from "@notionhq/client/build/src/api-endpoints";

import type { MinimalNotionClient } from "./minimal.ts";
import { getLastEditedTime } from "./utils.ts";

// Cache version - increment when cache format changes
const CACHE_VERSION = 2; // v2: Changed from databases.query to dataSources.query

export type Options = {
  base: MinimalNotionClient;
  databaseId: string;
  useFs?: boolean;
  baseDir: string;
  debug?: boolean;
};

export class CacheClient {
  base: MinimalNotionClient;
  databaseId: string;
  useFs: boolean;
  baseDir: string;
  debug: boolean;
  blockChildrenListCache = new Map<string, ListBlockChildrenResponse>();
  databaseCache = new Map<string, GetDataSourceResponse>();
  databaseQueryCache = new Map<string, QueryDataSourceResponse>();
  pageCache = new Map<string, GetPageResponse>();
  updatedAtMap = new Map<string, Date>();
  cacheUpdatedAtMap = new Map<string, Date>();
  parentMap = new Map<string, string>();

  constructor(options: Options) {
    this.base = options.base;
    this.databaseId = options.databaseId;
    this.useFs = options?.useFs ?? false;
    this.baseDir = options?.baseDir;
    this.debug = options?.debug ?? false;
    if (this.useFs) {
      fs.mkdirSync(this.baseDir, { recursive: true });
    }
    if (!this.baseDir) {
      throw new Error("baseDir must be set");
    }
  }

  dataSources: MinimalNotionClient["dataSources"] = {
    retrieve: async (args) => {
      const dataSourceId = args.data_source_id;

      const cache = this.databaseCache.get(dataSourceId);
      if (cache) {
        this.#log("use cache: data source for " + dataSourceId);
        return cache;
      }

      this.#log("get data source " + dataSourceId);
      const res = await this.base.dataSources.retrieve(args);

      this.databaseCache.set(dataSourceId, res);
      await this.#writeMetaCache();
      await this.#writeCache(`data_source-${dataSourceId}.json`, res);
      return res;
    },
    query: async (args) => {
      const databaseId = args.data_source_id;
      const key = cacheKey(databaseId, args.start_cursor);

      const cache = this.databaseQueryCache.get(key);
      if (cache) {
        this.#log("use cache: data source query for " + key);
        return cache;
      }

      this.#log("query data sources " + key);
      const res = await this.base.dataSources.query(args);
      this.databaseQueryCache.set(key, res);

      for (const p of res.results) {
        // Only process pages, not data sources
        if (p.object === "page") {
          const lastEditedTime = getLastEditedTime(p);
          if (lastEditedTime) {
            this.updatedAtMap.set(p.id, lastEditedTime);
          }
        }
      }

      await this.#writeMetaCache();
      return res;
    },
  };

  blocks: MinimalNotionClient["blocks"] = {
    children: {
      list: async (args) => {
        const blockId = args.block_id;
        const cursor = args.start_cursor;
        const key = cacheKey(blockId, cursor);

        if (this.#canUseCache(blockId)) {
          const blocks = this.blockChildrenListCache.get(key);
          if (blocks) {
            this.#log(`use blocks cache: id=${blockId}, cursor=${cursor}`);
            return blocks;
          }
        }

        this.#log(`fetch blocks: id=${blockId}, cursor=${cursor}`);
        const res = await this.base.blocks.children.list(args);

        // update cache
        this.blockChildrenListCache.set(key, res);
        const blockUpdatedAt = this.updatedAtMap.get(blockId);
        if (blockUpdatedAt) {
          this.cacheUpdatedAtMap.set(blockId, blockUpdatedAt);
        }

        for (const block of res.results) {
          if ("has_children" in block && block.has_children) {
            this.parentMap.set(block.id, blockId);
          }
        }

        await this.#writeMetaCache();
        await this.#writeCache(`blocks-${key}.json`, res);

        return res;
      },
    },
  };

  pages: MinimalNotionClient["pages"] = {
    retrieve: async (args) => {
      const pageId = args.page_id;

      const cache = this.pageCache.get(pageId);
      if (cache) {
        this.#log("use cache: page for " + pageId);
        return cache;
      }

      this.#log("get page " + pageId);
      const res = await this.base.pages.retrieve(args);
      this.pageCache.set(pageId, res);
      return res;
    },
  };

  async loadCache(): Promise<void> {
    if (!this.useFs) return;

    try {
      const dir = await fs.promises.readdir(this.baseDir);

      // Check cache version first
      if (dir.includes("meta.json")) {
        const meta = await this.#readCache("meta.json");
        const cacheVersion = meta.version || 1; // Default to v1 for old caches

        // Load meta data first (needed for migration and cache validation)
        const { updatedAt, parents } = meta;
        if (updatedAt) {
          this.cacheUpdatedAtMap = new Map(
            Object.entries(updatedAt).map(([k, v]) => [k, new Date(String(v))]),
          );
        }
        if (parents) {
          this.parentMap = new Map(Object.entries(parents));
        }

        // Then check version and migrate if needed
        if (cacheVersion < CACHE_VERSION) {
          this.#log(`Cache version outdated (found: ${cacheVersion}, expected: ${CACHE_VERSION}). Migrating cache.`);
          await this.#migrateCache(cacheVersion);
        } else if (cacheVersion > CACHE_VERSION) {
          this.#log(`Cache version newer than expected (found: ${cacheVersion}, expected: ${CACHE_VERSION}). Purging cache.`);
          await this.purgeCache();
          return;
        }
      }

      // Load block caches
      for (const file of dir) {
        if (!file.endsWith(".json") || !file.startsWith("blocks-")) {
          continue;
        }

        const data = await this.#readCache(file);
        const key = file.replace("blocks-", "").replace(".json", "");
        this.blockChildrenListCache.set(key, data);
      }
    } catch (error) {
      this.#log("Failed to load cache:", error);
      // If loading fails, purge and start fresh
      await this.purgeCache();
    }
  }

  async #migrateCache(fromVersion: number): Promise<void> {
    this.#log(`Migrating cache from v${fromVersion} to v${CACHE_VERSION}`);

    if (fromVersion === 1) {
      // v1 -> v2 migration:
      // The main change is databases.query -> dataSources.query
      // We don't cache database query results in files, only in memory,
      // so we just need to clear the in-memory cache and update the version.
      // Block caches and meta data remain compatible.

      this.databaseQueryCache.clear();
      this.#log("Cleared database query cache (incompatible with v2 dataSources.query)");

      // Update meta.json with new version
      await this.#writeMetaCache();
      this.#log("Updated cache version to v2");
    }

    // Add more migration logic here for future versions
  }

  async purgeCache(): Promise<void> {
    this.databaseCache.clear();
    this.databaseQueryCache.clear();
    this.blockChildrenListCache.clear();
    this.pageCache.clear();
    this.updatedAtMap.clear();
    this.parentMap.clear();

    if (!this.useFs) return;

    await fs.promises.rm(this.baseDir, { recursive: true });
    await fs.promises.mkdir(this.baseDir, { recursive: true });
  }

  async purgeCacheById(id: string): Promise<void> {
    // Find all children IDs that need to be purged
    const allIds = [id, ...this.allChildrenIds(id)];

    // Remove from memory caches
    for (const targetId of allIds) {
      this.updatedAtMap.delete(targetId);
      this.cacheUpdatedAtMap.delete(targetId);
      this.parentMap.delete(targetId);

      // Remove block cache entries with this ID
      const keysToDelete: string[] = [];
      for (const key of this.blockChildrenListCache.keys()) {
        if (key.startsWith(targetId) || key.startsWith(`${targetId}_`)) {
          keysToDelete.push(key);
        }
      }
      for (const key of keysToDelete) {
        this.blockChildrenListCache.delete(key);
      }
    }

    if (!this.useFs) {
      await this.#writeMetaCache();
      return;
    }

    // Remove cache files from filesystem
    try {
      const dir = await fs.promises.readdir(this.baseDir);
      const filesToDelete = dir.filter(file => {
        if (!file.endsWith('.json') || !file.startsWith('blocks-')) return false;
        const key = file.replace('blocks-', '').replace('.json', '');
        return allIds.some(targetId =>
          key.startsWith(targetId) || key.startsWith(`${targetId}_`)
        );
      });

      await Promise.all(
        filesToDelete.map(file =>
          fs.promises.unlink(path.join(this.baseDir, file)).catch(() => {})
        )
      );
    } catch (error) {
      this.#log(`Failed to remove cache files for ${id}:`, error);
    }

    // Update meta cache to reflect the changes
    await this.#writeMetaCache();
  }

  #canUseCache(blockId: string): boolean {
    const parentId = this.#findParent(blockId);
    if (!parentId) return false;

    const updatedAt = this.updatedAtMap.get(parentId);
    const cacheUpdatedAt = this.cacheUpdatedAtMap.get(parentId);

    // An error may occur if only some of the images have been downloaded, but when such a situation does not occur,
    // it is usually not necessary to check the expiration date of the image URL.

    // const pageExp = this.#pageCacheExpirationTime(parentId);

    const canUse =
      !!updatedAt &&
      !!cacheUpdatedAt &&
      updatedAt.getTime() === cacheUpdatedAt.getTime(); // &&
    // (!pageExp || pageExp.getTime() > Date.now());

    this.#log(
      "validate cache:",
      blockId,
      canUse ? "HIT" : "EXPIRED",
      "let:", // Last edited time
      updatedAt,
      "cache:",
      cacheUpdatedAt,
      // "exp:",
      // pageExp,
    );

    return canUse;
  }

  #findParent(id: string): string | undefined {
    let current = id;
    const ids = new Set<string>();

    while (true) {
      if (ids.has(current)) return; // circular reference

      const parent = this.parentMap.get(current);
      if (!parent) return current; // current is root

      ids.add(current);
      current = parent;
    }
  }

  async #writeMetaCache(): Promise<void> {
    if (!this.useFs) return;
    await this.#writeCache(`meta.json`, {
      version: CACHE_VERSION,
      updatedAt: Object.fromEntries(this.updatedAtMap),
      parents: Object.fromEntries(this.parentMap),
    });
  }

  async #readCache<T = any>(name: string): Promise<T> {
    this.#log("read cache: " + name);
    const data = await fs.promises.readFile(
      path.join(this.baseDir, name),
      "utf-8",
    );
    return JSON.parse(data);
  }

  async #writeCache(name: string, data: any): Promise<void> {
    if (!this.useFs) return;

    this.#log(`write cache: ${name}`);
    await fs.promises.writeFile(
      path.join(this.baseDir, name),
      JSON.stringify(data),
    );
  }

  allChildrenIds(parent: string): string[] {
    const ids: string[] = [];
    for (const [c, p] of this.parentMap) {
      if (p === parent) {
        ids.push(c, ...this.allChildrenIds(c));
      }
    }
    return ids;
  }

  // #pageCacheExpirationTime(pageId: string): Date | undefined {
  //   const allPageAndBlocks = [pageId, ...this.allChildrenIds(pageId)];
  //   const allCache = allPageAndBlocks
  //     .map((id) => this.blockChildrenListCache.get(id))
  //     .flatMap((res) => res?.results ?? []);
  //   return expiresInForObjects(allCache);
  // }

  #log(...args: any[]) {
    if (this.debug) console.debug("notiondown: cache:", ...args);
  }
}

function cacheKey(id: string, cursor?: string): string {
  return cursor ? `${id}_${cursor}` : id;
}
