#!/usr/bin/env node

import { writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { Command } from "commander";
import { Client } from "./index.ts";

const program = new Command();

program
  .name("astrotion")
  .description("Convert Notion pages to markdown and HTMLs with caching")
  .version("0.1.0")
  .requiredOption("--api <key>", "Notion API key")
  .requiredOption("--db <id>", "Notion database ID")
  .option("--output <path>", "output directory", "dist")
  .option("--cache <path>", "cache directory (use 'false' to disable)", "cache")
  .option("--download-images", "automatically download and cache images", true)
  .option("--no-download-images", "disable image downloading")
  .option("--optimize-images", "convert images to WebP", true)
  .option("--no-optimize-images", "disable image optimization");

async function main() {
  program.parse();
  const options = program.opts();

  const client = new Client(options.db, {
    auth: options.api,
    cacheDir: options.cache === "false" ? undefined : options.cache,
    downloadImages: options.downloadImages,
  });

  console.log("Loading cache...");
  await client.loadCache();

  console.log("Fetching database and posts...");
  const [db, posts] = await Promise.all([
    client.getDatabase(),
    client.getAllPosts(),
  ]);

  console.log(`Found ${posts.length} posts`);

  mkdirSync(options.output, { recursive: true });

  for (const post of posts) {
    console.log(`Processing: ${post.title}`);
    
    const content = await client.getPostContent(post.id);
    const filename = `${post.slug}.md`;
    const filepath = join(options.output, filename);
    
    mkdirSync(dirname(filepath), { recursive: true });
    writeFileSync(filepath, content.markdown, "utf-8");
    
    console.log(`Saved: ${filepath}`);
  }

  console.log("Done!");
}

main().catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});
