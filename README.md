# notiondown

A CLI tool and Node.js library to convert Notion pages to markdown and HTML with cache support.

💡 Are you looking for an Astro theme for Notion? -> [astrotion](https://github.com/rot1024/astrotion)

## Usage (CLI)

```
npx notiondown --auth API_KEY --db DATABASE_ID
```

```
Options:
  -V, --version                output the version number
  --auth <key>                 Notion API key
  --db <id>                    Notion database ID
  --page <id>                  Notion page ID when generating only specific page (optional)
  --output <path>              output directory (default: "dist")
  --image-dir <path>           image directory (default: "images")
  --cache-dir <path>           cache directory (default: "cache")
  --format                     md,html, md, or html (default: md,html)
  --frontmatter                add frontmatter to generated files (default: false)
  --cache                      enable cache (default: true)
  --download-images            download images. If "always" is specified, overwrites existing images. (default: true)
  --optimize-images            convert images to WebP (default: true)
  --properties <mapping>       Notion property name mappings in key=value format (e.g. title=Title,slug=Slug)
  --debug                      enable debug mode (default: false)

  Filter Options:
  --only-published             filter only published posts (Published=true)
  --date-before <date>         filter posts before specified date
  --date-after <date>          filter posts after specified date
  --date-on <date>             filter posts on specified date
  --tags <tags>                filter posts with specified tags (comma-separated, OR condition)
  --tags-all <tags>            filter posts with all specified tags (comma-separated, AND condition)
  --exclude-tags <tags>        exclude posts with specified tags (comma-separated)

  -h, --help                   display help for command
```

## Usage (lib)

```ts
import { Client } from "notiondown";

const client = new Client({
  auth: "NOTION_API_KEY",
  databaseId: "DATABASE_ID",
  cacheDir: "cache",
});

// if cache is available, load it
await client.loadCache();

// get metadata
const db = await client.getDatabase();

// get post list
const posts = await client.getAllPosts();

for (const post of posts) {
  // get post content (also images will be downloaded)
  // Pass all posts for internal link resolution
  const content = await client.getPostContent(post.id, posts);

  // content.markdown is markdown

  // content.html is html

  // download images to dist/images
  await downloadImages(content.images);
  // or
  // await downloadImagesWithRetry(content.images, post.id, client)
}
```

## Client options

```ts
type Options = {
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
  /** Custom property names */
  properties?: {
    /** Title property (title, default: Title) */
    title?: string;
    /** Slug property (text, default: Slug) */
    slug?: string;
    /** Date property (date, default: Date) */
    date?: string;
    /** FeatureImage property (file, default: FeatureImage) */
    featuredImage?: string;
    /** Tags property (multi_select, default: Tags) */
    tags?: string;
    /** Excerpt property (text, default: Excerpt) */
    excerpt?: string;
    /** Rank property (number, default: Rank) */
    rank?: string;
    /** CreatedAt property (created_time, default: CreatedAt) */
    createdAt?: string;
    /** UpdatedAt property (last_edited_time, default: UpdatedAt) */
    updatedAt?: string;
  };
  /** Transform function for internal page links. Defaults to post slug without extension. */
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

type DatabaseFilterOptions = {
  published?: {
    enabled: boolean;           // Published condition enabled (default: false)
    value: boolean;             // Expected value (default: true)
  };
  date?: {
    enabled: boolean;           // Date condition enabled (default: false)
    operator: 'on_or_before' | 'on_or_after' | 'equals' | 'before' | 'after';
    value?: string | Date;      // Comparison value (default: current time)
  };
  tags?: {
    enabled: boolean;           // Tags condition enabled (default: false)
    include?: string[];         // Tags to include (OR condition by default)
    exclude?: string[];         // Tags to exclude
    requireAll?: boolean;       // Require all included tags (AND condition, default: false)
  };
  customFilters?: any[];        // Additional custom Notion filters
};
```

## Examples

### CLI Examples

```bash
# Get all posts (no filters applied by default)
npx notiondown --auth API_KEY --db DATABASE_ID

# Get only published posts
npx notiondown --auth API_KEY --db DATABASE_ID --only-published

# Get posts with specific tags
npx notiondown --auth API_KEY --db DATABASE_ID --tags "tech,programming"

# Get posts with all specified tags
npx notiondown --auth API_KEY --db DATABASE_ID --tags-all "featured,published"

# Get published posts before the current date
npx notiondown --auth API_KEY --db DATABASE_ID --only-published --date-before now

# Get posts excluding specific tags
npx notiondown --auth API_KEY --db DATABASE_ID --exclude-tags "draft,private"

# Complex filtering: published tech posts from 2024
npx notiondown --auth API_KEY --db DATABASE_ID --only-published --tags "tech" --date-after "2024-01-01"

# Custom property names with filtering
npx notiondown --auth API_KEY --db DATABASE_ID --properties "published=IsPublished,tags=Categories" --only-published --tags "tech"
```

### Library Examples

```ts
import { Client } from "notiondown";

// Default: no filters applied (gets all posts)
const client = new Client({
  auth: "NOTION_API_KEY",
  databaseId: "DATABASE_ID",
  cacheDir: "cache"
});

// Basic filtering: only published posts from 2024
const publishedClient = new Client({
  auth: "NOTION_API_KEY",
  databaseId: "DATABASE_ID",
  cacheDir: "cache",
  filter: {
    published: { enabled: true, property: "Published", value: true },
    date: {
      enabled: true,
      operator: "on_or_after",
      value: "2024-01-01"
    }
  }
});

// Tag filtering: posts with "tech" OR "programming" tags
const techClient = new Client({
  auth: "NOTION_API_KEY",
  databaseId: "DATABASE_ID",
  cacheDir: "cache",
  filter: {
    tags: {
      enabled: true,
      include: ["tech", "programming"],
      requireAll: false // OR condition
    }
  }
});

// Advanced filtering: featured posts only, excluding drafts
const featuredClient = new Client({
  auth: "NOTION_API_KEY",
  databaseId: "DATABASE_ID",
  cacheDir: "cache",
  filter: {
    tags: {
      enabled: true,
      include: ["featured"],
      exclude: ["draft"]
    }
  }
});
```
