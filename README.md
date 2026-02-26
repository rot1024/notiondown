# notiondown

A CLI tool and Node.js library to convert Notion pages to markdown and HTML with cache support.

## Features

- **Caching**: Built-in file system cache to reduce Notion API calls
- **Flexible Filtering**: Filter posts by publish status, dates, and tags
- **Image & Video Optimization**: Automatic conversion to WebP and H.264/AAC formats
- **Syntax Highlighting**: Code blocks are highlighted using [Shiki](https://shiki.style/) with support for multiple themes
- **Customizable**: Extensive options for URL transforms, property mappings, and content processing

💡 Are you looking for an Astro theme for Notion? -> [astrotion](https://github.com/rot1024/astrotion)

### Mermaid Diagrams

notiondown does not include server-side rendering for Mermaid diagrams to avoid heavy dependencies (like Playwright). If you want to render Mermaid diagrams, please use a client-side solution in your frontend:

- [mermaid.js](https://mermaid.js.org/) - Official Mermaid library for browser rendering
- [@mermaid-js/mermaid-cli](https://github.com/mermaid-js/mermaid-cli) - CLI tool for pre-rendering diagrams
- Framework integrations: [React](https://github.com/mermaid-js/mermaid-react), [Vue](https://github.com/mermaid-js/mermaid-vue), [Svelte](https://github.com/mermaid-js/mermaid-svelte)

The generated HTML will contain code blocks with the `language-mermaid` class, which can be detected and rendered by these client-side libraries.

### Video Optimization (Optional)

To use video optimization (`--optimize-videos`), you need to install ffmpeg separately:

**macOS:**
```bash
brew install ffmpeg
```

**Ubuntu/Debian:**
```bash
sudo apt-get install ffmpeg
```

**Windows:**
```powershell
winget install --id=Gyan.FFmpeg -e
```
Or download from [https://ffmpeg.org/download.html](https://ffmpeg.org/download.html)

## Usage (CLI)

```
npx notiondown --auth API_KEY --data-source DATA_SOURCE_ID
```

```
Options:
  -V, --version                        output the version number
  --auth <key>                         Notion API key
  --data-source <id>                   Notion data source ID
  --page <id>                          Notion page ID when generating only specific page (optional)
  --output <path>                      output directory (default: "dist")
  --assets-dir <path>                  assets directory in output dir for images, videos, audio (default: "assets")
  --cache-dir <path>                   cache directory (default: "cache")
  --format                             md,html, md, or html (default: md,html)
  --frontmatter                        add frontmatter to generated files (default: false)
  --cache                              enable cache (default: true)
  --download-assets                    download assets (images, videos, audio). If "always" is specified, overwrites existing assets. (default: true)
  --optimize-images                    optimize images (convert to WebP) (default: true)
  --optimize-videos [formats]          optimize videos (convert to H.264/AAC with ffmpeg). Specify formats to convert (e.g. "mov,avi").
                                       WebM and MP4 are excluded by default as they are already optimized.
                                       Use "all" to convert all video formats including WebM and MP4.
                                       Requires ffmpeg to be installed separately.
  --asset-base-url <url>               base URL for assets (e.g. https://cdn.example.com/assets/)
  --internal-link-template <template>  internal link template using ${id}, ${slug}, ${date}, ${year}, ${month}, ${day} (e.g. https://example.com/posts/${slug})
  --filename-template <template>       filename template using ${dir}, ${id}, ${slug}, ${ext}, ${date}, ${year}, ${month}, ${day} (default: ${slug}.${ext}). ${dir} is auto-prepended when hierarchy mode is enabled.
  --properties <mapping>               Notion property name mappings in key=value format (e.g. slug=Slug,date=Date). Note: title is auto-detected)
  --additional-properties <properties> additional Notion properties to include in meta.json (comma-separated, e.g. author,status,category)
  --shiki-theme <theme>                Shiki theme for code syntax highlighting (e.g. github-light, monokai, nord) (default: github-dark)
  --debug                              enable debug mode (default: false)

  Filter Options:
  --only-published                     filter only published posts (Published=true)
  --date-before <date>                 filter posts before specified date
  --date-after <date>                  filter posts after specified date
  --date-on <date>                     filter posts on specified date
  --tags <tags>                        filter posts with specified tags (comma-separated, OR condition)
  --tags-all <tags>                    filter posts with all specified tags (comma-separated, AND condition)
  --exclude-tags <tags>                exclude posts with specified tags (comma-separated)

  Hierarchy Options:
  --hierarchy-mode <mode>              hierarchy mode: relation, subpage, or both
  --hierarchy-relation <property>      relation property name for hierarchy (required for relation/both mode)

  -h, --help                           display help for command
```

## Usage (lib)

```ts
import { Client } from "notiondown";

const client = new Client({
  auth: "NOTION_API_KEY",
  dataSourceId: "DATA_SOURCE_ID",
  cacheDir: "cache",
});

// With custom URL transforms and templates
const customClient = new Client({
  auth: "NOTION_API_KEY",
  dataSourceId: "DATA_SOURCE_ID",
  cacheDir: "cache",
  assetUrlTransform: (filename) => `https://cdn.myblog.com/assets/${filename}`,
  internalLink: (post) => `https://myblog.com/posts/${post.slug || post.id}`,
});

// if cache is available, load it
await client.loadCache();

// get metadata
const db = await client.getDatabase();

// get post list
const posts = await client.getAllPosts();

for (const post of posts) {
  // get post content (images, videos, audio will be collected)
  // Pass all posts for internal link resolution
  const content = await client.getPostContent(post.id, posts);

  // content.markdown is markdown

  // content.html is html

  // download assets (images, videos, audio) to dist/assets
  await downloadAssets(content.assets, {
    dir: "dist/assets",
    optimizeImages: true,              // optimize images (convert to WebP)
    optimizeVideos: ["mov", "avi"],    // optimize specific video formats (requires ffmpeg)
    // optimizeVideos: "all",          // optimize all video formats including WebM and MP4
    // optimizeVideos: undefined,      // don't optimize videos (default)
  });

  // Note: The CLI --optimize-videos flag (without value) is equivalent to:
  // optimizeVideos: ["mov", "avi", "mkv", "flv", "wmv", "m4v", "mpg", "mpeg"]
  // or with retry on 403 errors
  // await downloadAssetsWithRetry(content.assets, post.id, client, {
  //   dir: "dist/assets",
  //   optimizeImages: true,
  //   optimizeVideos: ["mov", "avi"],
  // })
}
```

## Client options

```ts
type Options = {
  /** Notion data source ID (database ID) */
  dataSourceId: string;
  /** Notion API key. It should be set until the custom client is provided. */
  auth?: string;
  /** Cache directory for storing cached data. It should be set until the custom client is provided. */
  cacheDir?: string;
  /** Relative path to assets directory, used for asset URLs (images, videos, audio) in markdown. Defaults to "assets". */
  assetsDir?: string;
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
    /** Publsihed property (checkbox, default: Publsihed) */
    published?: string;
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
  /** Additional property names to include in meta.json and post objects */
  additionalProperties?: string[];
  /** Transform function for asset URLs (images, videos, audio). Takes filename and returns the desired URL. */
  assetUrlTransform?: (filename: string) => string;
  /** Transform function for internal page links. Defaults to post slug without extension. */
  internalLink?: (post: Post) => string;
  /** Custom additional Notion markdown transformers */
  notionMdTransformers?: [BlockType, NotionMdTransformer][];
  /** Custom additional markdown transformers */
  mdTransformers?: MdTransformer[];
  /** Options for Md2Html (markdown to HTML conversion) */
  md2html?: {
    /** Custom unified processor (overrides all default processing) */
    custom?: UnifiedProcessor;
    /** Shiki theme for code syntax highlighting (default: "github-dark") */
    shikiTheme?: string; // e.g., "github-light", "monokai", "nord", etc.
  };
  /** Advanced: override Notion client with custom one */
  client?: MinimalNotionClient;
  /** Database filter options */
  filter?: DatabaseFilterOptions;
  /** Hierarchy options for nested directory output */
  hierarchy?: HierarchyOptions;
};

type HierarchyOptions = {
  mode: "relation" | "subpage" | "both";
  /** Relation property name (required for relation/both mode) */
  relationProperty?: string;
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

## GitHub Actions

notiondown can be used as a GitHub Action. Only `auth` and `data-source` are required inputs; all other CLI options can be passed via `args`. See [ACTION.md](ACTION.md) for full documentation and examples.

```yaml
- uses: rot1024/notiondown@latest
  with:
    auth: ${{ secrets.NOTION_API_KEY }}
    data-source: ${{ secrets.NOTION_DATABASE_ID }}
    args: >-
      --output content
      --format md
      --frontmatter
      --only-published
```

### Action Inputs

| Input | Required | Default | Description |
|-------|----------|---------|-------------|
| `auth` | Yes | | Notion API key |
| `data-source` | Yes | | Notion data source ID (database ID) |
| `args` | No | `''` | Additional CLI arguments (e.g. `--format md --frontmatter`) |
| `version` | No | `''` | notiondown version (e.g. `0.4.0`). Defaults to latest |
| `node-version` | No | `'20'` | Node.js version |
| `cache` | No | `'true'` | Cache Notion API responses across runs using actions/cache |
| `cache-dir` | No | `'cache'` | Cache directory path (must match `--cache-dir` in args if specified) |

### Action Outputs

| Output | Description |
|--------|-------------|
| `output-dir` | Path to the output directory |
| `meta-json` | Path to the generated `meta.json` file |

### Full Workflow Example

```yaml
name: Sync Notion Content
on:
  schedule:
    - cron: '0 */6 * * *'
  workflow_dispatch:

jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Convert Notion to Markdown
        id: notiondown
        uses: rot1024/notiondown@latest
        with:
          auth: ${{ secrets.NOTION_API_KEY }}
          data-source: ${{ secrets.NOTION_DATABASE_ID }}
          args: >-
            --output content
            --format md
            --frontmatter
            --only-published

      - name: Upload artifacts
        uses: actions/upload-artifact@v4
        with:
          name: notion-content
          path: ${{ steps.notiondown.outputs.output-dir }}
```

### Notes

- To use `--optimize-videos`, install ffmpeg in a prior step
- Template variables like `${slug}` in args must be single-quoted to avoid shell expansion (e.g. `--internal-link-template '/posts/${slug}'`)
- To disable caching, set `cache: 'false'`

## Examples

### CLI Examples

```bash
# Get all posts (no filters applied by default)
npx notiondown --auth API_KEY --data-source DATA_SOURCE_ID

# Get only published posts
npx notiondown --auth API_KEY --data-source DATA_SOURCE_ID --only-published

# Get posts with specific tags
npx notiondown --auth API_KEY --data-source DATA_SOURCE_ID --tags "tech,programming"

# Get posts with all specified tags
npx notiondown --auth API_KEY --data-source DATA_SOURCE_ID --tags-all "featured,published"

# Get published posts before the current date
npx notiondown --auth API_KEY --data-source DATA_SOURCE_ID --only-published --date-before now

# Get posts excluding specific tags
npx notiondown --auth API_KEY --data-source DATA_SOURCE_ID --exclude-tags "draft,private"

# Complex filtering: published tech posts from 2024
npx notiondown --auth API_KEY --data-source DATA_SOURCE_ID --only-published --tags "tech" --date-after "2024-01-01"

# Custom property names with filtering
npx notiondown --auth API_KEY --data-source DATA_SOURCE_ID --properties "published=IsPublished,tags=Categories" --only-published --tags "tech"

# Include additional properties in meta.json output
npx notiondown --auth API_KEY --data-source DATA_SOURCE_ID --additional-properties "author,status,category,priority"

# Custom filename template (organize by year/month)
npx notiondown --auth API_KEY --data-source DATA_SOURCE_ID --filename-template "${year}/${month}/${slug}.${ext}"

# Custom internal link template for blog posts
npx notiondown --auth API_KEY --data-source DATA_SOURCE_ID --internal-link-template "https://myblog.com/posts/${slug}"

# Using asset base URL for CDN
npx notiondown --auth API_KEY --data-source DATA_SOURCE_ID --asset-base-url "https://cdn.myblog.com/assets/"

# Optimize videos with default formats (excludes WebM and MP4)
# This converts: MOV, AVI, MKV, FLV, WMV, M4V, MPG, MPEG
npx notiondown --auth API_KEY --data-source DATA_SOURCE_ID --optimize-videos

# Optimize specific video formats only (e.g., MOV and AVI files)
npx notiondown --auth API_KEY --data-source DATA_SOURCE_ID --optimize-videos "mov,avi"

# Optimize all video formats including WebM and MP4
npx notiondown --auth API_KEY --data-source DATA_SOURCE_ID --optimize-videos "all"

# Customize Shiki theme for syntax highlighting
npx notiondown --auth API_KEY --data-source DATA_SOURCE_ID --shiki-theme "github-light"
npx notiondown --auth API_KEY --data-source DATA_SOURCE_ID --shiki-theme "monokai"

# Hierarchy mode: output nested directories using a self-referencing relation property
npx notiondown --auth API_KEY --data-source DATA_SOURCE_ID --hierarchy-mode relation --hierarchy-relation "Parent"

# Hierarchy mode: discover child pages (Notion subpages) and nest them
npx notiondown --auth API_KEY --data-source DATA_SOURCE_ID --hierarchy-mode subpage

# Hierarchy mode: combine relation + subpage
npx notiondown --auth API_KEY --data-source DATA_SOURCE_ID --hierarchy-mode both --hierarchy-relation "Parent"
```

### Library Examples

```ts
import { Client } from "notiondown";

// Default: no filters applied (gets all posts)
const client = new Client({
  auth: "NOTION_API_KEY",
  dataSourceId: "DATA_SOURCE_ID",
  cacheDir: "cache"
});

// Basic filtering: only published posts from 2024
const publishedClient = new Client({
  auth: "NOTION_API_KEY",
  dataSourceId: "DATA_SOURCE_ID",
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
  dataSourceId: "DATA_SOURCE_ID",
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
  dataSourceId: "DATA_SOURCE_ID",
  cacheDir: "cache",
  filter: {
    tags: {
      enabled: true,
      include: ["featured"],
      exclude: ["draft"]
    }
  }
});

// Include additional properties in post data
const clientWithAdditionalProps = new Client({
  auth: "NOTION_API_KEY",
  dataSourceId: "DATA_SOURCE_ID",
  cacheDir: "cache",
  additionalProperties: ["author", "status", "category", "priority"]
});

// Customize Shiki theme for syntax highlighting
const clientWithCustomTheme = new Client({
  auth: "NOTION_API_KEY",
  dataSourceId: "DATA_SOURCE_ID",
  cacheDir: "cache",
  md2html: {
    shikiTheme: "github-light" // or "monokai", "nord", "dracula", etc.
  }
});

// Hierarchy mode: nested directory output using relation property
const hierarchyClient = new Client({
  auth: "NOTION_API_KEY",
  dataSourceId: "DATA_SOURCE_ID",
  cacheDir: "cache",
  hierarchy: {
    mode: "relation",
    relationProperty: "Parent"
  }
});

// Use getPostTree() to get posts with hierarchy info
const { database, posts, assets, tree } = await hierarchyClient.getPostTree();
// tree.roots contains root-level HierarchyNodes
// tree.nodeMap maps post IDs to their HierarchyNode
// Each post has parentId, pathSegments, and childIds populated
```

## Hierarchy Mode

Hierarchy mode enables nested directory output, organizing pages into subdirectories based on parent-child relationships.

### Modes

| Mode | Description |
|---|---|
| `relation` | Uses a self-referencing relation property (e.g., "Parent") in the same database to define parent-child relationships |
| `subpage` | Discovers Notion child pages (subpages nested within a page) |
| `both` | Combines relation + subpage: first builds the tree from relations, then scans each page for subpages |

### Notion Setup (Relation Mode)

1. Add a **Relation** property to your database (e.g., name it "Parent")
2. Configure it as a **self-referencing relation** (relates to the same database)
3. For each child page, select its parent page in the "Parent" property

### Output Structure

```
dist/
├── meta.json
├── blog-post.md              ← Root page without children (flat)
├── guide/
│   ├── index.md              ← Root page with children (becomes index)
│   ├── getting-started.md    ← Child page (leaf)
│   └── advanced/
│       ├── index.md          ← Intermediate page with children
│       └── tips.md           ← Grandchild page (leaf)
└── assets/                   ← Assets remain flat
```

### Template Variable

The `${dir}` template variable is available in `--filename-template` for hierarchy paths. When hierarchy mode is enabled and the template doesn't include `${dir}`, it is automatically prepended.
