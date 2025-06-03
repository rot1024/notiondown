import type { QueryDatabaseParameters } from "@notionhq/client/build/src/api-endpoints";
import { NotionToMarkdown } from "notion-to-md";
import { Client as RawClient } from "@notionhq/client";

import { buildDatabase, buildPost, isValidPage } from "./conv.ts";

import type {
  Database,
  Post,
  PostContent,
  Client as ClientType,
} from "./interfaces";
import { Md2Html, UnifiedProcessor } from "./md2html.ts";
import { transform, type MdTransformer } from "./md2md.ts";
import { CacheClient, type MinimalNotionClient, getAll } from "./notion/index.ts";
import { newNotionToMarkdown } from "./notion-md/index.ts";
import { type BlockType, type NotionBlockTransformer as NotionMdTransformer } from "./notion-md/index.ts";

export type Options = {
  /** Notion database ID */
  databaseId: string;
  /** Notion API key. It should be set until the custom client is provided. */
  auth?: string;
  /** Cache directory for storing cached data. It should be set until the custom client is provided. */
  cacheDir?: string;
  /** Relative path to image directory, used for image URLs in markdown. Defaults to "images". */
  imageDir?: string;
  /** Render markdown to HTML. Defaults to true. */
  renderHtml?: boolean;
  /** If true, debug messages will be logged to console. Defaults to false. */
  debug?: boolean;
  /** Custom additional Notion markdown transformers */
  notionMdTransformers?: [BlockType, NotionMdTransformer][];
  /** Custom additional markdown transformers */
  mdTransformers?: MdTransformer[];
  /** Overrides unified processor */
  md2html?: UnifiedProcessor;
  /** Advanced: override Notion client with custom one */
  client?: MinimalNotionClient;
};

export class Client implements ClientType {
  cacheClient?: CacheClient;
  client: MinimalNotionClient;
  n2m: NotionToMarkdown;
  databaseId: string;
  cacheDir?: string;
  imageDir: string;
  renderHtml?: boolean;
  debug = false;
  mdTransformers: MdTransformer[] = [];
  md2html: Md2Html;

  constructor(options: Options) {
    if (!options.databaseId) {
      throw new Error("client and databaseId must be set");
    }

    if (!options.client) {
      if (!options.cacheDir || !options.auth) {
        throw new Error("cacheDir and auth must be set when client is not provided");
      }

      const rawClient = new RawClient({
        auth: options.auth,
      });

      this.cacheClient = new CacheClient({
        base: rawClient,
        databaseId: options.databaseId,
        useFs: true,
        debug: !!options.debug,
        baseDir: options.cacheDir,
      });
      this.client = this.cacheClient;
    } else {
      if (options.client instanceof CacheClient) {
        this.cacheClient = options.client;
      }
      this.client = options.client;
    }

    this.databaseId = options.databaseId;
    this.debug = options.debug || false;
    this.cacheDir = options.cacheDir;
    this.imageDir = options.imageDir ?? "images";
    this.renderHtml = options.renderHtml ?? true;
    this.mdTransformers = options.mdTransformers || [];

    this.md2html = new Md2Html(options.md2html);
    this.n2m = newNotionToMarkdown(this.client);
    if (options.notionMdTransformers) {
      for (const [blockType, transformer] of options.notionMdTransformers) {
        this.n2m.setCustomTransformer(blockType, transformer);
      }
    }
  }

  async loadCache() {
    if (this.cacheClient) {
      await this.cacheClient.loadCache();
    }
  }

  async purgeCache() {
    if (this.cacheClient) {
      await this.cacheClient.purgeCache();
    }
  }

  async purgeCacheById(id: string) {
    if (this.cacheClient) {
      await this.cacheClient.purgeCacheById(id);
    }
  }

  async getDatabaseAndAllPosts(): Promise<{
    database: Database;
    posts: Post[];
    images: Map<string, string>;
  }> {
    const [database, posts] = await Promise.all([
      this.getDatabase(),
      this.getAllPosts(),
    ]);

    const images = new Map<string, string>();
    if (database.images) {
      for (const [url, assetUrl] of Object.entries(database.images)) {
        images.set(url, assetUrl);
      }
    }

    for (const post of posts) {
      if (post.images) {
        for (const [url, assetUrl] of Object.entries(post.images)) {
          images.set(url, assetUrl);
        }
      }
    }

    return { database, posts, images };
  }

  async getDatabase(): Promise<Database> {
    const res = await this.client.databases.retrieve({
      database_id: this.databaseId,
    });
    return buildDatabase(res, this.imageDir);
  }

  async getAllPosts(): Promise<Post[]> {
    const params: QueryDatabaseParameters = {
      database_id: this.databaseId,
      filter: {
        and: [
          {
            property: "Published",
            checkbox: {
              equals: true,
            },
          },
          {
            property: "Date",
            date: {
              on_or_before: new Date().toISOString(),
            },
          },
        ],
      },
      sorts: [
        {
          property: "Date",
          direction: "descending",
        },
      ],
      page_size: 100,
    };

    const results = await getAll((cursor) =>
      this.client.databases.query({
        ...params,
        start_cursor: cursor,
      }),
    );

    const posts = results.filter(isValidPage).map(p => buildPost(p, this.imageDir));
    return posts;
  }

  async getPostById(pageId: string): Promise<Post | null> {
    try {
      const page = await this.client.pages.retrieve({ page_id: pageId });
      if (isValidPage(page)) {
        return buildPost(page, this.imageDir);
      }
      return null;
    } catch (error) {
      if (this.debug) {
        console.error(`Failed to retrieve page ${pageId}:`, error);
      }
      return null;
    }
  }

  async getPostContent(postId: string): Promise<PostContent> {
    const posts = await this.getAllPosts();
    const mdblocks = await this.n2m.pageToMarkdown(postId);

    const images = new Map<string, string>();
    const transformed = transform({
      blocks: mdblocks,
      posts,
      images,
      imageDir: this.imageDir,
      transformers: this.mdTransformers,
    });

    const { parent: markdown } = this.n2m.toMarkdownString(transformed);
    const html = this.renderHtml ? await this.md2html.process(markdown) : "";

    return {
      markdown,
      html,
      images,
    };
  }
}
