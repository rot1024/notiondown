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
  .requiredOption("--db <id>", "Notion database ID")
  .option("--page <id>", "Notion page ID when generating only specific page (optional)")
  .option("--output <path>", "output directory", "dist")
  .option("--image-dir <path>", "image directory in output dir", "images")
  .option("--cache-dir <path>", "cache directory", "cache")
  .option("--format", "md,html, md, or html (default: md,html)")
  .option("--frontmatter", "add frontmatter to generated files", false)
  .option("--cache", "enable cache", true)
  .option("--download-images", "download images. If \"always\" is specified, overwrites existing images.", true)
  .option("--optimize-images", "convert images to WebP", true)
  .option("--image-base-url <url>", "base URL for images (e.g. https://cdn.example.com/images/)")
  .option("--properties <mapping>", "Notion property name mappings in key=value format (e.g. title=Title,slug=Slug)")
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
