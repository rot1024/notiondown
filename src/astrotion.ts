import type { QueryDatabaseParameters } from "@notionhq/client/build/src/api-endpoints";
import { NotionToMarkdown } from "notion-to-md";
import { Client as RawClient } from "@notionhq/client";

import { buildDatabase, buildPost, isValidPage } from "./conv.ts";
import { downloadImages } from "./download.ts";
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
import { paginate } from "./utils.ts";

export class Client implements ClientType {
  cacheClient?: CacheClient;
  client: MinimalNotionClient;
  n2m: NotionToMarkdown;
  databaseId: string;
  debug = false;
  cacheDir?: string;
  concurrency?: number;
  downloadImages: boolean;

  constructor(
    databaseId: string,
    options: {
      auth?: string,
      client?: MinimalNotionClient,
      cacheDir?: string,
      concurrency?: number,
      debug?: boolean,
      downloadImages?: boolean,
    }
  ) {
    if (!databaseId) {
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
        databaseId: databaseId,
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

    this.databaseId = databaseId;
    this.debug = options?.debug || false;
    this.cacheDir = options?.cacheDir;
    this.concurrency = options?.concurrency;
    this.downloadImages = options?.downloadImages ?? true;
    this.n2m = newNotionToMarkdown(this.client);
  }

  async loadCache() {
    if (this.cacheClient) {
      await this.cacheClient.loadCache();
    }
  }

  async listPosts(
    page: string,
    filter?: (p: Post, i: number, a: Post[]) => boolean,
  ): Promise<{
    database: Database;
    posts: Post[];
    pageCount: number;
    pageInt: number;
  }> {
    const { database, posts } = await this.getDatabaseAndPosts();
    const filteredPosts = filter ? posts.filter(filter) : posts;
    const { pageCount, pageInt, pagePosts } = paginate(filteredPosts, page);
    if (this.downloadImages && this.cacheDir) {
      const images = [database?.images, ...pagePosts.map((p) => p.images)];
      await downloadImages(images, {
        cacheDir: this.cacheDir,
        concurrency: this.concurrency,
      });
    }

    return {
      database,
      pageCount,
      pageInt,
      posts: pagePosts,
    };
  }

  async getPost(slug: string) {
    const { database, post } = await this.getDatabaseAndPostBySlug(slug);
    if (!post) throw new Error(`Post not found: ${slug}`);

    const content = post ? await this.getPostContent(post.id) : undefined;
    const html = content ? await markdownToHTML(content.markdown) : undefined;
    if (this.downloadImages && this.cacheDir) {
      const images = [database?.images, post?.images, content?.images];
      await downloadImages(images, {
        cacheDir: this.cacheDir,
        concurrency: this.concurrency,
      });
    }

    return {
      database,
      post,
      html,
    };
  }

  async getDatabaseAndPosts(): Promise<{ database: Database; posts: Post[] }> {
    return Promise.all([this.getDatabase(), this.getAllPosts()]).then(
      ([database, posts]) => ({ database, posts }),
    );
  }

  async getDatabaseAndPostBySlug(
    slug: string | undefined,
  ): Promise<{ database: Database; post: Post | undefined }> {
    return Promise.all([
      this.getDatabase(),
      slug ? this.getPostBySlug(slug) : Promise.resolve(undefined),
    ]).then(([database, post]) => ({ database, post }));
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
    const transformed = transform(mdblocks, posts, images);

    const markdown = this.n2m.toMarkdownString(transformed);

    return {
      markdown: markdown.parent,
      images,
    };
  }
}
