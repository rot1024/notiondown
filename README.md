# astrotion

A Node.js library to convert Notion pages to markdown and HTMLs with caching

💡 Are you looking for an Astro theme? -> [astrotion-theme](https://github.com/rot1024/astrotion-theme)

## Usage (CLI)

```
npx astrotion --auth API_KEY --db database_id
```

```
Options:
  -V, --version      output the version number
  --auth <key>       Notion API key
  --db <id>          Notion database ID
  --output <path>    output directory (default: "dist")
  --imagedir <path>  image directory (default: "images")
  --cachedir <path>  cache directory (default: "cache")
  --cache            enable cache (default: true)
  --download-images  download images. If "always" is specified, overwrites existing images. (default: true)
  --optimize-images  convert images to WebP (default: true)
  --debug            enable debug mode (default: false)
  -h, --help         display help for command
```

## Usage (lib)

```ts
import { Client } from "astrotion";

const client = new Client({
  auth: "NOTION_API_KEY",
  db: "DATABASE_ID",
});

// if cache is available, load it
await client.loadCache();

// get metadata
const db = await client.getDatabase();

// get post list
const posts = await client.getAllPosts();

for (const post of posts) {
  // get post content (also images will be donwloaded)
  const content = await client.getPostContent(post.id);

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
