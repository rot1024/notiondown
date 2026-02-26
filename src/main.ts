import { writeFileSync, mkdirSync } from "fs";
import { dirname, join } from "path";
import { Client, downloadAssets, downloadAssetsWithRetry } from "./index.ts";
import type { Post, DatabaseFilterOptions } from "./interfaces.ts";
import type { HierarchyTree, HierarchyMode } from "./hierarchy.ts";
import { getHierarchyDir, getEffectiveSlug, computeRelativePath } from "./hierarchy.ts";

export type MainOptions = {
  auth: string;
  dataSource: string;
  page?: string;
  output?: string;
  assetsDir?: string;
  cacheDir?: string;
  format?: string;
  frontmatter?: boolean;
  cache?: boolean;
  downloadAssets?: boolean | "always";
  optimizeImages?: boolean;
  optimizeVideos?: boolean | string;
  assetBaseUrl?: string;
  internalLinkTemplate?: string;
  filenameTemplate?: string;
  properties?: string;
  additionalProperties?: string;
  shikiTheme?: string;
  debug?: boolean;
  concurrency?: number;
  onlyPublished?: boolean;
  dateBefore?: string;
  dateAfter?: string;
  dateOn?: string;
  tags?: string;
  tagsAll?: string;
  excludeTags?: string;
  hierarchyMode?: string;
  hierarchyRelation?: string;
};

type MetaPost = Post & {
  fileName: Record<string, string>;
  path?: string;
}

const DEFAULT_OPTIONS = {
  output: "dist",
  assetsDir: "assets",
  cacheDir: "cache",
  format: "md,html",
  frontmatter: false,
  cache: true,
  downloadAssets: true,
  optimizeImages: true,
  optimizeVideos: undefined,
  debug: false,
  filenameTemplate: "${slug}${_lang}.${ext}",
} satisfies Omit<MainOptions, "dataSource" | "auth">;

export async function main(opts: MainOptions) {
  const options = { ...DEFAULT_OPTIONS, ...opts };

  const assetsDownloadDir = join(options.output, options.assetsDir);
  const format = options.format.split(",").map((f) => f.trim());

  // Parse video optimization formats
  let videoFormatsToOptimize: string[] | "all" | undefined = undefined;
  if (options.optimizeVideos) {
    if (typeof options.optimizeVideos === "string") {
      if (options.optimizeVideos.toLowerCase() === "all") {
        videoFormatsToOptimize = "all";
      } else {
        videoFormatsToOptimize = options.optimizeVideos
          .split(",")
          .map((f) => f.trim().toLowerCase())
          .filter(Boolean);
      }
    } else if (options.optimizeVideos === true) {
      // Default: exclude mp4 and webm (already optimized formats)
      videoFormatsToOptimize = ["mov", "avi", "mkv", "flv", "wmv", "m4v", "mpg", "mpeg"];
    }
  }

  // Parse property mappings
  let properties: Record<string, string> | undefined = undefined;
  if (options.properties) {
    properties = {};
    const pairs = options.properties.split(",");
    for (const pair of pairs) {
      const [key, value] = pair.split("=").map((s: string) => s.trim());
      if (key && value) {
        properties[key] = value;
      }
    }
  }

  // Parse additional properties
  let additionalProperties: string[] | undefined = undefined;
  if (options.additionalProperties) {
    additionalProperties = options.additionalProperties.split(",").map((prop: string) => prop.trim()).filter(Boolean);
  }

  // Parse filter options
  const filter: DatabaseFilterOptions = {};

  // Published filter
  if (options.onlyPublished) {
    filter.published = {
      enabled: true,
      value: true,
    };
  }

  // Date filter
  if (options.dateBefore || options.dateAfter || options.dateOn) {
    filter.date = {
      enabled: true,
      operator: "on_or_before",
      value: new Date(),
    };

    // Override with specific date options
    if (options.dateBefore) {
      filter.date.operator = "on_or_before";
      filter.date.value = options.dateBefore;
    } else if (options.dateAfter) {
      filter.date.operator = "on_or_after";
      filter.date.value = options.dateAfter;
    } else if (options.dateOn) {
      filter.date.operator = "equals";
      filter.date.value = options.dateOn;
    }
  }

  // Tags filter
  const tagsInclude = options.tags ? options.tags.split(",").map((t: string) => t.trim()) : undefined;
  const tagsIncludeAll = options.tagsAll ? options.tagsAll.split(",").map((t: string) => t.trim()) : undefined;
  const tagsExclude = options.excludeTags ? options.excludeTags.split(",").map((t: string) => t.trim()) : undefined;

  if (tagsInclude || tagsIncludeAll || tagsExclude) {
    filter.tags = {
      enabled: true,
      include: tagsInclude || tagsIncludeAll,
      exclude: tagsExclude,
      requireAll: !!tagsIncludeAll,
    };
  }

  // Create asset URL transform function if base URL is provided
  let assetUrlTransform: ((filename: string) => string) | undefined;
  if (options.assetBaseUrl) {
    const baseUrl = options.assetBaseUrl.endsWith('/')
      ? options.assetBaseUrl
      : options.assetBaseUrl + '/';
    assetUrlTransform = (filename: string) => baseUrl + filename;
  }

  // Helper function to format date parts
  const formatDateParts = (postDate?: string) => {
    if (!postDate) {
      return { date: '', year: '', month: '', day: '' };
    }
    const dateObj = new Date(postDate);
    const year = dateObj.getFullYear().toString();
    const month = (dateObj.getMonth() + 1).toString().padStart(2, '0');
    const day = dateObj.getDate().toString().padStart(2, '0');
    const date = `${year}-${month}-${day}`;
    return { date, year, month, day };
  };

  // Create internal link transform function if template is provided
  // tree is assigned later, but the closure captures the variable reference
  let tree: HierarchyTree | null = null;
  let internalLink: ((post: Post, fromPost?: Post) => string) | undefined;
  if (options.internalLinkTemplate) {
    internalLink = (post: Post) => {
      const { date, year, month, day } = formatDateParts(post.date);
      return options.internalLinkTemplate!
        .replace(/\$\{id\}/g, post.id)
        .replace(/\$\{slug\}/g, post.slug || post.id)
        .replace(/\$\{date\}/g, date)
        .replace(/\$\{year\}/g, year)
        .replace(/\$\{month\}/g, month)
        .replace(/\$\{day\}/g, day)
        .replace(/\$\{lang\}/g, post.lang || '');
    };
  }

  // Parse hierarchy options
  let hierarchyMode: HierarchyMode | undefined;
  if (options.hierarchyMode) {
    if (!["relation", "subpage", "both"].includes(options.hierarchyMode)) {
      throw new Error(`Invalid hierarchy mode: ${options.hierarchyMode}. Must be "relation", "subpage", or "both".`);
    }
    hierarchyMode = options.hierarchyMode as HierarchyMode;
    if ((hierarchyMode === "relation" || hierarchyMode === "both") && !options.hierarchyRelation) {
      throw new Error(`--hierarchy-relation is required when using hierarchy mode "${hierarchyMode}".`);
    }
    // Auto-add ${dir} to filename template if hierarchy is enabled and template doesn't include it
    if (!options.filenameTemplate.includes("${dir}")) {
      options.filenameTemplate = "${dir}" + options.filenameTemplate;
    }
    // Set default internal link function for hierarchy mode if no template is provided
    if (!internalLink) {
      internalLink = (targetPost: Post, fromPost?: Post) => {
        if (!tree) return targetPost.slug || targetPost.id;
        return computeRelativePath(fromPost, targetPost, tree);
      };
    }
  }

  // Function to generate filename from template
  const generateFilename = (post: Post, ext: string, tree?: HierarchyTree | null): string => {
    const { date, year, month, day } = formatDateParts(post.date);
    const dir = tree ? getHierarchyDir(post.id, tree) : "";
    const slug = tree ? getEffectiveSlug(post.id, tree) : (post.slug || post.id);
    return options.filenameTemplate
      .replace(/\$\{dir\}/g, dir)
      .replace(/\$\{id\}/g, post.id)
      .replace(/\$\{slug\}/g, slug || post.id)
      .replace(/\$\{ext\}/g, ext)
      .replace(/\$\{date\}/g, date)
      .replace(/\$\{year\}/g, year)
      .replace(/\$\{month\}/g, month)
      .replace(/\$\{day\}/g, day)
      .replace(/\$\{lang\}/g, post.lang || '')
      .replace(/\$\{_lang\}/g, post.lang ? '_' + post.lang : '');
  };

  const client = new Client({
    dataSourceId: options.dataSource,
    auth: options.auth,
    cacheDir: options.cache ? options.cacheDir : undefined,
    assetsDir: options.assetsDir,
    assetUrlTransform,
    internalLink,
    properties,
    additionalProperties,
    md2html: options.shikiTheme ? { shikiTheme: options.shikiTheme as any } : undefined,
    debug: options.debug,
    filter,
    hierarchy: hierarchyMode ? {
      mode: hierarchyMode,
      relationProperty: options.hierarchyRelation,
    } : undefined,
  });

  console.log("Loading cache...");
  await client.loadCache();

  let posts;
  let database;
  let assets = new Map<string, string>();

  if (options.page) {
    // Generate only specific page
    console.log(`Fetching specific page: ${options.page}`);
    const post = await client.getPostById(options.page);
    if (!post) {
      console.error(`Page with ID ${options.page} not found or not accessible`);
      process.exit(1);
    }
    posts = [post];
    database = await client.getDatabase();

    // Collect assets from database and the specific post
    if (database.images) {
      for (const [url, assetUrl] of Object.entries(database.images)) {
        assets.set(url, assetUrl);
      }
    }
    if (post.images) {
      for (const [url, assetUrl] of Object.entries(post.images)) {
        assets.set(url, assetUrl);
      }
    }

    console.log(`Found page: ${post.title}`);
  } else if (hierarchyMode) {
    // Generate all posts with hierarchy
    console.log("Fetching database and posts with hierarchy...");
    const result = await client.getPostTree();
    database = result.database;
    posts = result.posts;
    assets = result.assets;
    tree = result.tree;
    console.log(`Found ${posts.length} posts (hierarchy mode: ${hierarchyMode})`);
  } else {
    // Generate all posts
    console.log("Fetching database and posts...");
    const result = await client.getDatabaseAndAllPosts();
    database = result.database;
    posts = result.posts;
    assets = result.assets;
    console.log(`Found ${posts.length} posts`);
  }

  mkdirSync(options.output, { recursive: true });

  // save meta.json
  const metaData = { ...database };
  delete metaData.images;
  const postsData = posts.map(post => {
    // Add fileName with generated file names for each format
    const fileName: Record<string, string> = {};
    const formatList = options.format.split(",").map((f) => f.trim());
    for (const ext of formatList) {
      fileName[ext] = generateFilename(post, ext, tree);
    }

    const postData: MetaPost = { ...post, fileName };
    delete postData.images;

    // Add hierarchy path when hierarchy is enabled
    if (tree) {
      postData.path = post.pathSegments?.join("/") || post.slug;
    }

    return postData;
  });
  const meta = { database: metaData, posts: postsData };
  const metaFilePath = join(options.output, "meta.json");
  writeFileSync(metaFilePath, JSON.stringify(meta, null, 2), "utf-8");
  console.log(`Saved meta data to ${metaFilePath}`);

  // download assets (images, videos, audio)
  if (options.downloadAssets && assets.size > 0) {
    console.log(`Found ${assets.size} assets to download`);
    await downloadAssets(assets, {
      dir: assetsDownloadDir,
      concurrency: options.concurrency,
      optimizeImages: options.optimizeImages,
      optimizeVideos: videoFormatsToOptimize,
      debug: options.debug,
      overwrite: options.downloadAssets === "always",
    });
  }

  // save posts as markdown and HTML files
  for (const post of posts) {
    console.log(`Processing: ${post.title}`);

    let content = await client.getPostContent(post.id, posts);
    const ext = [];

    if (format.includes("md") && content.markdown) {
      const filenameMd = generateFilename(post, "md", tree);
      const filepathMd = join(options.output, filenameMd);
      let markdownContent = content.markdown;

      if (options.frontmatter) {
        const frontmatter = generateFrontmatter(post);
        markdownContent = frontmatter + content.markdown;
      }

      mkdirSync(dirname(filepathMd), { recursive: true });
      writeFileSync(filepathMd, markdownContent, "utf-8");
      ext.push("md");
    }

    if (format.includes("html") && content.html) {
      const filenameHtml = generateFilename(post, "html", tree);
      const filepathHtml = join(options.output, filenameHtml);
      let htmlContent = content.html;

      if (options.frontmatter) {
        const htmlMetadata = generateHtmlMetadata(post);
        htmlContent = htmlMetadata + content.html;
      }

      mkdirSync(dirname(filepathHtml), { recursive: true });
      writeFileSync(filepathHtml, htmlContent, "utf-8");
      ext.push("html");
    }

    if (options.downloadAssets && content.assets && content.assets.size > 0) {
      console.log(`Downloading ${content.assets.size} assets for post ${post.id}...`);
      await downloadAssetsWithRetry(content.assets, post.id, client, {
        dir: assetsDownloadDir,
        concurrency: options.concurrency,
        optimizeImages: options.optimizeImages,
        optimizeVideos: videoFormatsToOptimize,
        debug: options.debug,
        overwrite: options.downloadAssets === "always",
      });
    }

    if (ext.length > 0) {
      const filenames = ext.map(e => generateFilename(post, e, tree));
      console.log(`Saved: ${filenames.join(", ")}`);
    }
  }

  console.log("Done!");
}

function formatAdditionalProperty(value: unknown): unknown {
  if (value === null || value === undefined) {
    return undefined;
  }
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  // select / status: {id, name, color} → name
  if (typeof value === "object" && !Array.isArray(value) && "name" in (value as Record<string, unknown>)) {
    const obj = value as Record<string, unknown>;
    // date: {start, end} → start
    if ("start" in obj) {
      return obj.start as string;
    }
    return obj.name;
  }
  // arrays: multi_select/people, relation, files
  if (Array.isArray(value)) {
    return value.map(item => {
      if (typeof item === "object" && item !== null) {
        // files: {type, url, name} → url
        if ("url" in item) {
          return (item as Record<string, unknown>).url;
        }
        // multi_select / people: {id, name, ...} → name
        if ("name" in item) {
          return (item as Record<string, unknown>).name;
        }
        // relation: {id} → id
        if ("id" in item) {
          return (item as Record<string, unknown>).id;
        }
      }
      return item;
    });
  }
  // date: {start, end} (without name)
  if (typeof value === "object" && "start" in (value as Record<string, unknown>)) {
    return (value as Record<string, unknown>).start as string;
  }
  return value;
}

function generateFrontmatter(post: Post): string {
  const frontmatter: Record<string, any> = {
    title: post.title,
    slug: post.slug || post.id,
    date: post.date,
    excerpt: post.excerpt,
    tags: post.tags.map(tag => tag.name),
    rank: post.rank,
  };

  // Add lang if it exists
  if (post.lang) {
    frontmatter.lang = post.lang;
  }

  // Add createdAt and updatedAt if they exist
  if (post.createdAt) {
    frontmatter.createdAt = post.createdAt;
  }
  if (post.updatedAt) {
    frontmatter.updatedAt = post.updatedAt;
  }

  // Add icon and cover if they exist
  if (post.icon) {
    frontmatter.icon = post.icon;
  }
  if (post.cover) {
    frontmatter.cover = post.cover;
  }
  if (post.featuredImage) {
    frontmatter.featuredImage = post.featuredImage;
  }

  // Add additional properties
  if (post.additionalProperties) {
    for (const [key, value] of Object.entries(post.additionalProperties)) {
      const formatted = formatAdditionalProperty(value);
      if (formatted !== undefined) {
        frontmatter[key] = formatted;
      }
    }
  }

  // Convert to YAML frontmatter
  const yamlLines = Object.entries(frontmatter)
    .filter(([_, value]) => value !== undefined && value !== null && value !== "")
    .map(([key, value]) => {
      if (Array.isArray(value)) {
        if (value.length === 0) {
          return `${key}: []`;
        }
        return `${key}:\n${value.map(item => `  - "${item}"`).join('\n')}`;
      }
      if (typeof value === 'string') {
        if (value.includes('\n')) {
          // Use YAML literal block scalar for multiline strings
          const indented = value.split('\n').map(line => `  ${line}`).join('\n');
          return `${key}: |\n${indented}`;
        }
        // Escape quotes for single-line strings
        const escapedValue = value.replace(/"/g, '\\"');
        return `${key}: "${escapedValue}"`;
      }
      return `${key}: ${value}`;
    });

  return `---\n${yamlLines.join('\n')}\n---\n\n`;
}

function generateHtmlMetadata(post: Post): string {
  const metadata: Record<string, any> = {
    title: post.title,
    slug: post.slug || post.id,
    date: post.date,
    excerpt: post.excerpt,
    tags: post.tags.map(tag => tag.name),
    rank: post.rank,
  };

  // Add lang if it exists
  if (post.lang) {
    metadata.lang = post.lang;
  }

  // Add createdAt and updatedAt if they exist
  if (post.createdAt) {
    metadata.createdAt = post.createdAt;
  }
  if (post.updatedAt) {
    metadata.updatedAt = post.updatedAt;
  }

  // Add icon and cover if they exist
  if (post.icon) {
    metadata.icon = post.icon;
  }
  if (post.cover) {
    metadata.cover = post.cover;
  }
  if (post.featuredImage) {
    metadata.featuredImage = post.featuredImage;
  }

  // Add additional properties
  if (post.additionalProperties) {
    for (const [key, value] of Object.entries(post.additionalProperties)) {
      const formatted = formatAdditionalProperty(value);
      if (formatted !== undefined) {
        metadata[key] = formatted;
      }
    }
  }

  // Convert to JSON and embed in HTML comment
  const jsonData = JSON.stringify(metadata, null, 2);
  return `<!--\n${jsonData}\n-->\n\n`;
}
