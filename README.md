# notiondown

A CLI tool and Node.js library to convert Notion pages to markdown and HTML with cache support.

💡 Are you looking for an Astro theme? -> [astrotion-theme](https://github.com/rot1024/astrotion-theme)

## Usage (CLI)

```
npx notiondown --auth API_KEY --db DATABASE_ID
```

```
Options:
  -V, --version       output the version number
  --auth <key>        Notion API key
  --db <id>           Notion database ID
  --output <path>     output directory (default: "dist")
  --image-dir <path>  image directory (default: "images")
  --cache-dir <path>  cache directory (default: "cache")
  --format            md,html, md, or html (default: md,html)
  --download-images   download images. If "always" is specified, overwrites existing images. (default: true)
  --optimize-images   convert images to WebP (default: true)
  --page              Notion page ID to retribe a specific page instead of all pages in the database
  --debug             enable debug mode (default: false)
  -h, --help          display help for command
```

## Usage (lib)

```ts
import { Client } from "notiondown";

const client = new Client({
  auth: "NOTION_API_KEY",
  databaseId: "DATABASE_ID",
  cacheDir: "cache",
  // Transform internal page links to .html files
  internalLink: (slug) => `${slug}.html`,
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
  // await downloadImagesWithRetry(post.id, content.images, client)
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
    /** Title property (title, default: Page) */
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
    /** UpdatedAt property (updated_at/last_edited_time, default: UpdatedAt) */
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
};
```
