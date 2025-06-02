# astrotion

Convert Notion pages to markdown and HTMLs with caching

```
npx astrotion --api API_KEY --db database_id --output dist --cache cache
```

```ts
import { run } from "astrotion";

await run({
  api: "API_KEY",
  db: "DATABASE_ID",
  output: "dist",
  cache: "cache",
});
```

## Options

```ts
type Options = {
  // Notion API key
  api: string;
  // Notion database ID
  db: string;
  // output path
  output: string = "dist";
  // cache path. If false, cache will be disabled.
  cache?: string | false = "cache";
  // If true, automatically download and cache images
  donwloadImages: boolean = true;
  // If true, convert images to WebP
  optimizeImages: boolean = true;
}
```
