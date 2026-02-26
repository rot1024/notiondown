# notiondown GitHub Action

Convert Notion databases to markdown/HTML directly in your GitHub Actions workflow.

## Quick Start

```yaml
- uses: rot1024/notiondown@latest
  with:
    auth: ${{ secrets.NOTION_API_KEY }}
    data-source: ${{ secrets.NOTION_DATABASE_ID }}
```

All [CLI options](README.md#usage-cli) can be passed via the `args` input:

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

## Inputs

| Input | Required | Default | Description |
|-------|----------|---------|-------------|
| `auth` | Yes | | Notion API key |
| `data-source` | Yes | | Notion data source ID (database ID) |
| `args` | No | `''` | Additional CLI arguments passed directly to notiondown |
| `version` | No | `''` | notiondown version to install (e.g. `0.4.0`). Defaults to latest |
| `node-version` | No | `'20'` | Node.js version |
| `cache` | No | `'true'` | Cache Notion API responses across runs using `actions/cache` |
| `cache-dir` | No | `'cache'` | Cache directory path (must match `--cache-dir` in args if specified) |

## Outputs

| Output | Description |
|--------|-------------|
| `output-dir` | Path to the output directory containing generated files |
| `meta-json` | Path to the generated `meta.json` file |

## Examples

### Basic: Sync Notion to markdown

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

### Commit changes back to the repo

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

      - uses: rot1024/notiondown@latest
        with:
          auth: ${{ secrets.NOTION_API_KEY }}
          data-source: ${{ secrets.NOTION_DATABASE_ID }}
          args: >-
            --output content
            --format md
            --frontmatter
            --only-published

      - name: Commit and push
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git add content/
          git diff --staged --quiet || git commit -m "chore: sync notion content"
          git push
```

### With filtering and custom templates

```yaml
- uses: rot1024/notiondown@latest
  with:
    auth: ${{ secrets.NOTION_API_KEY }}
    data-source: ${{ secrets.NOTION_DATABASE_ID }}
    args: >-
      --output src/content
      --format md
      --frontmatter
      --only-published
      --date-before now
      --tags "blog,tech"
      --additional-properties "author,status"
      --filename-template '${year}/${month}/${slug}.${ext}'
      --asset-base-url "https://cdn.example.com/assets/"
      --shiki-theme github-light
```

### With video optimization

```yaml
jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Install ffmpeg
        run: sudo apt-get install -y ffmpeg

      - uses: rot1024/notiondown@latest
        with:
          auth: ${{ secrets.NOTION_API_KEY }}
          data-source: ${{ secrets.NOTION_DATABASE_ID }}
          args: >-
            --output content
            --format md
            --optimize-videos
```

### Hierarchy mode

```yaml
- uses: rot1024/notiondown@latest
  with:
    auth: ${{ secrets.NOTION_API_KEY }}
    data-source: ${{ secrets.NOTION_DATABASE_ID }}
    args: >-
      --output content
      --format md
      --frontmatter
      --hierarchy-mode relation
      --hierarchy-relation "Parent"
```

### Pin a specific version

```yaml
- uses: rot1024/notiondown@latest
  with:
    auth: ${{ secrets.NOTION_API_KEY }}
    data-source: ${{ secrets.NOTION_DATABASE_ID }}
    version: '0.4.0'
```

### Disable caching

```yaml
- uses: rot1024/notiondown@latest
  with:
    auth: ${{ secrets.NOTION_API_KEY }}
    data-source: ${{ secrets.NOTION_DATABASE_ID }}
    cache: 'false'
    args: '--no-cache'
```

## Caching

By default, the action caches Notion API responses between workflow runs using `actions/cache`. This significantly reduces API calls and speeds up subsequent runs.

- The cache key is based on the `data-source` input, so different databases have separate caches.
- To disable caching, set `cache: 'false'` and pass `--no-cache` in args.
- If you customize `--cache-dir` in args, make sure to also set the `cache-dir` input to match.

## Notes

- **Template variables**: When using `${slug}`, `${id}`, etc. in args, use single quotes to prevent shell expansion:
  ```yaml
  args: >-
    --filename-template '${year}/${slug}.${ext}'
    --internal-link-template '/posts/${slug}'
  ```
- **Video optimization**: Requires ffmpeg. Install it in a prior step (see example above).
- **Security**: The `auth` input is passed via environment variable and masked in logs. Do not put your API key directly in `args`.
