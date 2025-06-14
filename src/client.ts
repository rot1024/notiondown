import type { QueryDatabaseParameters } from "@notionhq/client/build/src/api-endpoints";
import { NotionToMarkdown } from "notion-to-md";
import { Client as RawClient } from "@notionhq/client";

import { buildDatabase, buildPost, DEFAULT_PROPERTY_NAMES, isValidPage, PropertyNames } from "./conv.ts";

import type {
  Database,
  Post,
  Client as ClientType,
  DatabaseFilterOptions,
  PostContent,
} from "./interfaces";
import { Md2Html, UnifiedProcessor } from "./md2html.ts";
import { transform, type MdTransformer } from "./md2md.ts";
import { CacheClient, type MinimalNotionClient, getAll } from "./notion/index.ts";
import { newNotionToMarkdown } from "./notion-md/index.ts";
import { type BlockType, type NotionBlockTransformer as NotionMdTransformer } from "./notion-md/index.ts";
import { buildDatabaseFilter } from "./utils.ts";

export type Options = {
  /** Notion database ID */
  databaseId: string;
  /** Notion API key. It should be set until the custom client is provided. */
  auth?: string;
  /** Cache directory for storing cached data. It should be set until the custom client is provided. */
  cacheDir?: string;
  /** Relative path to image directory, used for image URLs in markdown. Defaults to "images". */
  imageDir?: string;
  /** Transform function for image URLs. Takes filename and returns the desired URL. */
  imageUrlTransform?: (filename: string) => string;
  /** Render markdown to HTML. Defaults to true. */
  renderHtml?: boolean;
  /** If true, debug messages will be logged to console. Defaults to false. */
  debug?: boolean;
  /** Custom property names */
  properties?: PropertyNames;
  /** Additional property names to include in meta.json */
  additionalProperties?: string[];
  /** Transform function for internal page links. Defaults to slug without extension. */
  internalLink?: (post: Post) => string;
  /** Custom additional Notion markdown transformers */
  notionMdTransformers?: [BlockType, NotionMdTransformer][];
  /** Custom additional markdown transformers */
  mdTransformers?: MdTransformer[];
  /** Overrides unified processor */
  md2html?: UnifiedProcessor;
  /** Advanced: override Notion client with custom one */
  client?: MinimalNotionClient;
  /** Database filter options */
  filter?: DatabaseFilterOptions;
};

export class Client implements ClientType {
  cacheClient?: CacheClient;
  client: MinimalNotionClient;
  n2m: NotionToMarkdown;
  databaseId: string;
  cacheDir?: string;
  imageDir: string;
  imageUrlTransform?: (filename: string) => string;
  renderHtml?: boolean;
  debug = false;
  properties: Required<PropertyNames>;
  additionalProperties: string[];
  internalLink?: (post: Post) => string;
  mdTransformers: MdTransformer[] = [];
  md2html: Md2Html;
  filter: DatabaseFilterOptions;

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
    this.imageUrlTransform = options.imageUrlTransform;
    this.renderHtml = options.renderHtml ?? true;
    this.properties = { ...DEFAULT_PROPERTY_NAMES, ...options.properties };
    this.additionalProperties = options.additionalProperties || [];
    this.internalLink = options.internalLink;
    this.mdTransformers = options.mdTransformers || [];
    this.filter = { ...options.filter };

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
    const filter = buildDatabaseFilter(this.filter, this.properties);
    const params: QueryDatabaseParameters = {
      database_id: this.databaseId,
      filter,
      sorts: [
        {
          property: this.properties.date,
          direction: "descending",
        },
      ],
      page_size: 100,
    };

    if (this.debug) {
      console.log("notiondown: querying database with params:", JSON.stringify(params, null, 2));
    }

    const results = await getAll((cursor) =>
      this.client.databases.query({
        ...params,
        start_cursor: cursor,
      }),
    );

    const posts = results
      .filter(p => isValidPage(p, this.properties, this.debug))
      .map(p =>  buildPost(p, this.imageDir, this.properties, this.additionalProperties));


    if (this.debug) {
      console.log(`notiondown: retrieved ${results.length} posts and filtered to ${posts.length} valid posts.`);
    }
    return posts;
  }

  async getPostById(pageId: string): Promise<Post | null> {
    try {
      const page = await this.client.pages.retrieve({ page_id: pageId });
      if (isValidPage(page, this.properties, this.debug)) {
        return buildPost(page, this.imageDir, this.properties, this.additionalProperties);
      }
      return null;
    } catch (error) {
      if (this.debug) {
        console.error(`Failed to retrieve page ${pageId}:`, error);
      }
      return null;
    }
  }

  async getPostContent(postId: string, posts?: Post[]): Promise<PostContent> {
    const mdblocks = await this.n2m.pageToMarkdown(postId);

    const images = new Map<string, string>();
    const transformed = transform({
      blocks: mdblocks,
      posts,
      images,
      imageDir: this.imageDir,
      imageUrlTransform: this.imageUrlTransform,
      internalLink: this.internalLink,
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
