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
import { markdownToHTML } from "./md2html.ts";
import { transform } from "./md2md.ts";
import { CacheClient, type MinimalNotionClient, getAll } from "./notion/index.ts";
import { newNotionToMarkdown } from "./notion-md/index.ts";

export type Options = {
  /** Notion database ID */
  databaseId: string,
  /** Notion API key. It should be set until the custom client is provided. */
  auth?: string,
  /** Cache directory for storing cached data. It should be set until the custom client is provided. */
  cacheDir?: string,
  /** Relative path to image directory, used for image URLs in markdown. Defaults to "images". */
  imageDir?: string,
  /** If true, debug messages will be logged to console. Defaults to false. */
  debug?: boolean,
  /** Advanced: override Notion client with custom one */
  client?: MinimalNotionClient,
};

export class Client implements ClientType {
  cacheClient?: CacheClient;
  client: MinimalNotionClient;
  n2m: NotionToMarkdown;
  databaseId: string;
  cacheDir?: string;
  imageDir: string;
  debug = false;

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
    this.n2m = newNotionToMarkdown(this.client);
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

  async getAllTags(): Promise<string[]> {
    const posts = await this.getAllPosts();
    const tags = new Set<string>();
    posts.forEach((post) => post.tags.forEach((tag) => tags.add(tag.name)));
    return Array.from(tags);
  }

  async getDatabase(): Promise<Database> {
    const res = await this.client.databases.retrieve({
      database_id: this.databaseId,
    });
    return buildDatabase(res);
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

    const posts = results.filter(isValidPage).map(buildPost);
    return posts;
  }

  async getPostById(postId: string | undefined): Promise<Post | undefined> {
    if (!postId) return undefined;
    const posts = await this.getAllPosts();
    return posts.find((post) => post.id === postId);
  }

  async getPostBySlug(slug: string): Promise<Post | undefined> {
    if (!slug) return undefined;
    const posts = await this.getAllPosts();
    return posts.find((post) => post.slug === slug);
  }

  async getPostContent(postId: string): Promise<PostContent> {
    const posts = await this.getAllPosts();
    const mdblocks = await this.n2m.pageToMarkdown(postId);

    const images = new Map<string, string>();
    const transformed = transform(mdblocks, posts, images, this.imageDir);

    const { parent: markdown } = this.n2m.toMarkdownString(transformed);
    const html = await markdownToHTML(markdown);

    return {
      markdown,
      html,
      images,
    };
  }
}
