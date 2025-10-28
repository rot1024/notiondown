#!/usr/bin/env node

import { Command } from "commander";
import { run, type RunOptions } from "./index.ts";
import pkg from "../package.json";

const program = new Command();

program
  .name(pkg.name)
  .description(pkg.description)
  .version(pkg.version)
  .requiredOption("--auth <key>", "Notion API key")
  .option("--data-source <id>", "Notion data source ID")
  .option("--db <id>", "[deprecated: use --data-source] Notion data source ID")
  .option("--page <id>", "Notion page ID when generating only specific page (optional)")
  .option("--output <path>", "output directory", "dist")
  .option("--assets-dir <path>", "assets directory in output dir (for images, videos, audio)", "assets")
  .option("--image-dir <path>", "[deprecated: use --assets-dir] image directory in output dir", "images")
  .option("--cache-dir <path>", "cache directory", "cache")
  .option("--format", "md,html, md, or html (default: md,html)")
  .option("--frontmatter", "add frontmatter to generated files", false)
  .option("--cache", "enable cache", true)
  .option("--download-assets", "download assets (images, videos, audio). If \"always\" is specified, overwrites existing assets.", true)
  .option("--download-images", "[deprecated: use --download-assets] download images. If \"always\" is specified, overwrites existing images.", true)
  .option("--optimize-assets", "optimize assets (convert images to WebP)", true)
  .option("--optimize-images", "[deprecated: use --optimize-assets] convert images to WebP", true)
  .option("--asset-base-url <url>", "base URL for assets (e.g. https://cdn.example.com/assets/)")
  .option("--image-base-url <url>", "[deprecated: use --asset-base-url] base URL for images (e.g. https://cdn.example.com/images/)")
  .option("--internal-link-template <template>", "internal link template using ${id}, ${slug}, ${date}, ${year}, ${month}, ${day} (e.g. https://example.com/posts/${slug})")
  .option("--filename-template <template>", "filename template using ${id}, ${slug}, ${ext}, ${date}, ${year}, ${month}, ${day}, ${lang}, ${_lang} (default: ${slug}${_lang}.${ext})")
  .option("--properties <mapping>", "Notion property name mappings in key=value format (e.g. slug=Slug,date=Date). Note: title is auto-detected")
  .option("--additional-properties <properties>", "additional Notion properties to include in meta.json (comma-separated, e.g. author,status,category)")
  .option("--debug", "enable debug mode", false)
  // Filter options
  .option("--only-published", "filter only published posts (Published=true)")
  .option("--date-before <date>", "filter posts before specified date")
  .option("--date-after <date>", "filter posts after specified date")
  .option("--date-on <date>", "filter posts on specified date")
  .option("--tags <tags>", "filter posts with specified tags (comma-separated, OR condition)")
  .option("--tags-all <tags>", "filter posts with all specified tags (comma-separated, AND condition)")
  .option("--exclude-tags <tags>", "exclude posts with specified tags (comma-separated)");


program.parse();
const options = program.opts() as RunOptions;
run(options).catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});
