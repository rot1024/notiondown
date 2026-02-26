import type { QueryDataSourceParameters, PageObjectResponse, PartialPageObjectResponse } from "@notionhq/client/build/src/api-endpoints";
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
import {
  type HierarchyOptions,
  type HierarchyTree,
  buildRelationTree,
  buildSubpageTree,
  buildBothTree,
} from "./hierarchy.ts";
import { Md2Html, type Md2HtmlOptions, UnifiedProcessor } from "./md2html.ts";
import { transform, type MdTransformer } from "./md2md.ts";
import { CacheClient, type MinimalNotionClient, getAll } from "./notion/index.ts";
import { newNotionToMarkdown } from "./notion-md/index.ts";
import { type BlockType, type NotionBlockTransformer as NotionMdTransformer } from "./notion-md/index.ts";
import { buildDatabaseFilter } from "./utils.ts";

export type Options = {
  /** Notion data source ID (database ID) */
  dataSourceId: string;
  /** Notion API key. It should be set until the custom client is provided. */
  auth?: string;
  /** Cache directory for storing cached data. It should be set until the custom client is provided. */
  cacheDir?: string;
  /** Relative path to assets directory, used for asset URLs (images, videos, audio) in markdown. Defaults to "assets". */
  assetsDir?: string;
  /** Transform function for asset URLs (images, videos, audio). Takes filename and returns the desired URL. */
  assetUrlTransform?: (filename: string) => string;
  /** Render markdown to HTML. Defaults to true. */
  renderHtml?: boolean;
  /** If true, debug messages will be logged to console. Defaults to false. */
  debug?: boolean;
  /** Custom property names */
  properties?: PropertyNames;
  /** Additional property names to include in meta.json */
  additionalProperties?: string[];
  /** Transform function for internal page links. Defaults to slug without extension. fromPost is the page containing the link. */
  internalLink?: (post: Post, fromPost?: Post) => string;
  /** Custom additional Notion markdown transformers */
  notionMdTransformers?: [BlockType, NotionMdTransformer][];
  /** Custom additional markdown transformers */
  mdTransformers?: MdTransformer[];
  /** Options for Md2Html (markdown to HTML conversion) */
  md2html?: Md2HtmlOptions;
  /** Advanced: override Notion client with custom one */
  client?: MinimalNotionClient;
  /** Database filter options */
  filter?: DatabaseFilterOptions;
  /** Hierarchy options for nested directory output */
  hierarchy?: HierarchyOptions;
};

export class Client implements ClientType {
  cacheClient?: CacheClient;
  client: MinimalNotionClient;
  n2m: NotionToMarkdown;
  databaseId: string;
  cacheDir?: string;
  assetsDir: string;
  assetUrlTransform?: (filename: string) => string;
  renderHtml?: boolean;
  debug = false;
  properties: Required<Omit<PropertyNames, 'parent'>> & Pick<PropertyNames, 'parent'>;
  additionalProperties: string[];
  internalLink?: (post: Post, fromPost?: Post) => string;
  mdTransformers: MdTransformer[] = [];
  md2html: Md2Html;
  filter: DatabaseFilterOptions;
  hierarchy?: HierarchyOptions;

  constructor(options: Options) {
    if (!options.dataSourceId) {
      throw new Error("dataSourceId must be set");
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
        databaseId: options.dataSourceId,
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

    this.databaseId = options.dataSourceId;
    this.debug = options.debug || false;
    this.cacheDir = options.cacheDir;
    this.assetsDir = options.assetsDir || "assets";
    this.assetUrlTransform = options.assetUrlTransform;
    this.renderHtml = options.renderHtml ?? true;
    this.properties = { ...DEFAULT_PROPERTY_NAMES, ...options.properties };
    this.additionalProperties = options.additionalProperties || [];
    this.internalLink = options.internalLink;
    this.mdTransformers = options.mdTransformers || [];
    this.filter = { ...options.filter };
    this.hierarchy = options.hierarchy;

    // Auto-add relation property to additionalProperties for hierarchy relation/both mode
    if (this.hierarchy?.relationProperty) {
      const relProp = this.hierarchy.relationProperty;
      if (!this.additionalProperties.includes(relProp)) {
        this.additionalProperties = [...this.additionalProperties, relProp];
      }
      // Also set the parent property name for buildPost
      this.properties = { ...this.properties, parent: relProp };
    }

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
    assets: Map<string, string>;
  }> {
    const [database, posts] = await Promise.all([
      this.getDatabase(),
      this.getAllPosts(),
    ]);

    const assets = new Map<string, string>();
    if (database.images) {
      for (const [url, assetUrl] of Object.entries(database.images)) {
        assets.set(url, assetUrl);
      }
    }

    for (const post of posts) {
      if (post.images) {
        for (const [url, assetUrl] of Object.entries(post.images)) {
          assets.set(url, assetUrl);
        }
      }
    }

    return { database, posts, assets };
  }

  async getDatabase(): Promise<Database> {
    const res = await this.client.dataSources.retrieve({
      data_source_id: this.databaseId,
    });
    return buildDatabase(res, this.assetsDir);
  }

  async getAllPosts(): Promise<Post[]> {
    const filter = buildDatabaseFilter(this.filter, this.properties);
    const params: QueryDataSourceParameters = {
      data_source_id: this.databaseId,
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
      console.log("notiondown: querying data source with params:", JSON.stringify(params, null, 2));
    }

    const results = await getAll((cursor) =>
      this.client.dataSources.query({
        ...params,
        start_cursor: cursor,
      }),
    );

    // Filter out data sources and keep only pages
    const pages = results.filter(p => p.object === "page");

    const posts = pages
      .filter(p => isValidPage(p, this.properties, this.debug))
      .map(p =>  buildPost(p, this.assetsDir, this.properties, this.additionalProperties));


    if (this.debug) {
      console.log(`notiondown: retrieved ${results.length} posts and filtered to ${posts.length} valid posts.`);
    }
    return posts;
  }

  async getPostTree(): Promise<{
    database: Database;
    posts: Post[];
    assets: Map<string, string>;
    tree: HierarchyTree | null;
  }> {
    const { database, posts, assets } = await this.getDatabaseAndAllPosts();

    if (!this.hierarchy) {
      return { database, posts, assets, tree: null };
    }

    let tree: HierarchyTree;
    switch (this.hierarchy.mode) {
      case "relation":
        if (!this.hierarchy.relationProperty) {
          throw new Error("hierarchy.relationProperty is required for relation mode");
        }
        tree = buildRelationTree(posts, this.hierarchy.relationProperty);
        break;
      case "subpage":
        tree = await buildSubpageTree(
          posts,
          this.client,
          this.assetsDir,
          this.properties,
          this.additionalProperties,
        );
        break;
      case "both":
        if (!this.hierarchy.relationProperty) {
          throw new Error("hierarchy.relationProperty is required for both mode");
        }
        tree = await buildBothTree(
          posts,
          this.hierarchy.relationProperty,
          this.client,
          this.assetsDir,
          this.properties,
          this.additionalProperties,
        );
        break;
    }

    // Collect assets from any new posts added by subpage scanning
    for (const post of posts) {
      if (post.images) {
        for (const [url, assetUrl] of Object.entries(post.images)) {
          assets.set(url, assetUrl);
        }
      }
    }

    return { database, posts, assets, tree };
  }

  async getPostById(pageId: string): Promise<Post | null> {
    try {
      const page = await this.client.pages.retrieve({ page_id: pageId });
      if (isValidPage(page, this.properties, this.debug)) {
        return buildPost(page, this.assetsDir, this.properties, this.additionalProperties);
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

    const assets = new Map<string, string>();
    const transformed = transform({
      blocks: mdblocks,
      posts,
      assets,
      assetsDir: this.assetsDir,
      assetUrlTransform: this.assetUrlTransform,
      internalLink: this.internalLink,
      fromPostId: postId,
      transformers: this.mdTransformers,
    });

    const { parent: markdown } = this.n2m.toMarkdownString(transformed);
    const html = this.renderHtml ? await this.md2html.process(markdown) : "";

    return {
      markdown,
      html,
      assets,
    };
  }
}
