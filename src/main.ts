import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { Client, downloadImages, downloadImagesWithRetry } from "./index.ts";
import type { Post, DatabaseFilterOptions } from "./interfaces.ts";

export type MainOptions = {
  auth: string;
  db: string;
  page?: string;
  output?: string;
  imageDir?: string;
  cacheDir?: string;
  format?: string;
  frontmatter?: boolean;
  cache?: boolean;
  downloadImages?: boolean | "always";
  optimizeImages?: boolean;
  imageBaseUrl?: string;
  internalLinkTemplate?: string;
  filenameTemplate?: string;
  properties?: string;
  debug?: boolean;
  concurrency?: number;
  onlyPublished?: boolean;
  dateBefore?: string;
  dateAfter?: string;
  dateOn?: string;
  tags?: string;
  tagsAll?: string;
  excludeTags?: string;
};

const DEFAULT_OPTIONS = {
  output: "dist",
  imageDir: "images",
  cacheDir: "cache",
  format: "md,html",
  frontmatter: false,
  cache: true,
  downloadImages: true,
  optimizeImages: true,
  debug: false,
  filenameTemplate: "${slug}.${ext}",
} satisfies Omit<MainOptions, "db" | "auth">;

export async function main(opts: MainOptions) {
  const options = { ...DEFAULT_OPTIONS, ...opts };
  const imageDownloadDir = join(options.output, options.imageDir);
  const format = options.format.split(",").map((f) => f.trim());

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

  // Create image URL transform function if base URL is provided
  let imageUrlTransform: ((filename: string) => string) | undefined;
  if (options.imageBaseUrl) {
    const baseUrl = options.imageBaseUrl.endsWith('/')
      ? options.imageBaseUrl
      : options.imageBaseUrl + '/';
    imageUrlTransform = (filename: string) => baseUrl + filename;
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
  let internalLink: ((post: Post) => string) | undefined;
  if (options.internalLinkTemplate) {
    internalLink = (post: Post) => {
      const { date, year, month, day } = formatDateParts(post.date);
      return options.internalLinkTemplate!
        .replace(/\$\{id\}/g, post.id)
        .replace(/\$\{slug\}/g, post.slug || post.id)
        .replace(/\$\{date\}/g, date)
        .replace(/\$\{year\}/g, year)
        .replace(/\$\{month\}/g, month)
        .replace(/\$\{day\}/g, day);
    };
  }

  // Function to generate filename from template
  const generateFilename = (post: Post, ext: string): string => {
    const { date, year, month, day } = formatDateParts(post.date);
    return options.filenameTemplate
      .replace(/\$\{id\}/g, post.id)
      .replace(/\$\{slug\}/g, post.slug || post.id)
      .replace(/\$\{ext\}/g, ext)
      .replace(/\$\{date\}/g, date)
      .replace(/\$\{year\}/g, year)
      .replace(/\$\{month\}/g, month)
      .replace(/\$\{day\}/g, day);
  };

  const client = new Client({
    databaseId: options.db,
    auth: options.auth,
    cacheDir: options.cache ? options.cacheDir : undefined,
    imageDir: options.imageDir,
    imageUrlTransform,
    internalLink,
    properties,
    debug: options.debug,
    filter,
  });

  console.log("Loading cache...");
  await client.loadCache();

  let posts;
  let database;
  let images = new Map<string, string>();

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

    // Collect images from database and the specific post
    if (database.images) {
      for (const [url, assetUrl] of Object.entries(database.images)) {
        images.set(url, assetUrl);
      }
    }
    if (post.images) {
      for (const [url, assetUrl] of Object.entries(post.images)) {
        images.set(url, assetUrl);
      }
    }

    console.log(`Found page: ${post.title}`);
  } else {
    // Generate all posts
    console.log("Fetching database and posts...");
    const result = await client.getDatabaseAndAllPosts();
    database = result.database;
    posts = result.posts;
    images = result.images;
    console.log(`Found ${posts.length} posts`);
  }

  mkdirSync(options.output, { recursive: true });

  // save meta.json
  const metaData = { ...database };
  delete metaData.images;
  const postsData = posts.map(post => {
    const postData = { ...post };
    delete postData.images;
    return postData;
  });
  const meta = { database: metaData, posts: postsData };
  const metaFilePath = join(options.output, "meta.json");
  writeFileSync(metaFilePath, JSON.stringify(meta, null, 2), "utf-8");
  console.log(`Saved meta data to ${metaFilePath}`);

  // download images
  if (options.downloadImages && images.size > 0) {
    console.log(`Found ${images.size} images to download`);
    await downloadImages(images, {
      dir: imageDownloadDir,
      concurrency: options.concurrency,
      optimize: options.optimizeImages,
      debug: options.debug,
      overwrite: options.downloadImages === "always",
    });
  }

  // save posts as markdown and HTML files
  for (const post of posts) {
    console.log(`Processing: ${post.title}`);

    let content = await client.getPostContent(post.id, posts);
    const ext = [];

    if (format.includes("md") && content.markdown) {
      const filenameMd = generateFilename(post, "md");
      const filepathMd = join(options.output, filenameMd);
      let markdownContent = content.markdown;

      if (options.frontmatter) {
        const frontmatter = generateFrontmatter(post);
        markdownContent = frontmatter + content.markdown;
      }

      writeFileSync(filepathMd, markdownContent, "utf-8");
      ext.push("md");
    }

    if (format.includes("html") && content.html) {
      const filenameHtml = generateFilename(post, "html");
      const filepathHtml = join(options.output, filenameHtml);
      let htmlContent = content.html;

      if (options.frontmatter) {
        const htmlMetadata = generateHtmlMetadata(post);
        htmlContent = htmlMetadata + content.html;
      }

      writeFileSync(filepathHtml, htmlContent, "utf-8");
      ext.push("html");
    }

    if (options.downloadImages && content.images && content.images.size > 0) {
      console.log(`Downloading ${content.images.size} images for post ${post.id}...`);
      await downloadImagesWithRetry(content.images, post.id, client, {
        dir: imageDownloadDir,
        concurrency: options.concurrency,
        optimize: options.optimizeImages,
        debug: options.debug,
        overwrite: options.downloadImages === "always",
      });
    }

    if (ext.length > 0) {
      const filenames = ext.map(e => generateFilename(post, e));
      console.log(`Saved: ${filenames.join(", ")}`);
    }
  }

  console.log("Done!");
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
        // Escape quotes and handle multiline strings
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

  // Convert to JSON and embed in HTML comment
  const jsonData = JSON.stringify(metadata, null, 2);
  return `<!--\n${jsonData}\n-->\n\n`;
}
