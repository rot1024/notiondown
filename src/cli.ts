#!/usr/bin/env node

import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { Command } from "commander";
import { Client, downloadImages, downloadImagesWithRetry } from "./index.ts";

const program = new Command();

program
  .name("astrotion")
  .description("Convert Notion pages to markdown and HTMLs with caching")
  .version("0.1.0")
  .requiredOption("--auth <key>", "Notion API key")
  .requiredOption("--db <id>", "Notion database ID")
  .option("--output <path>", "output directory", "dist")
  .option("--imagedir <path>", "image directory", "images")
  .option("--cachedir <path>", "cache directory", "cache")
  .option("--cache", "enable cache", true)
  .option("--download-images", "download images", true)
  .option("--optimize-images", "convert images to WebP", true)
  .option("--debug", "enable debug mode", false);

async function main() {
  program.parse();
  const options = program.opts();
  const imageDownloadDir = join(options.output, options.imagedir);

  const client = new Client({
    databaseId: options.db,
    auth: options.auth,
    cacheDir: options.cache ? options.cachedir : undefined,
    imageDir: options.imagedir,
    debug: options.debug,
  });

  console.log("Loading cache...");
  await client.loadCache();

  console.log("Fetching database and posts...");
  const [database, posts] = await Promise.all([
    client.getDatabase(),
    client.getAllPosts(),
  ]);

  console.log(`Found ${posts.length} posts`);

  mkdirSync(options.output, { recursive: true });

  // download images
  const images = new Map<string, string>();
  if (database.images) {
    for (const [url, assetUrl] of database.images.entries()) {
      images.set(url, assetUrl);
    }
    delete database.images; // remove images from database to clean up the meta.json
  }

  for (const post of posts) {
    if (post.images) {
      for (const [url, assetUrl] of Object.entries(post.images)) {
        images.set(url, assetUrl);
      }
      delete post.images; // remove images from post to clean up the meta.json
    }
  }

  console.log(`Found ${images.size} images to download`);
  await downloadImages(images, {
    dir: imageDownloadDir,
    concurrency: options.concurrency,
    optimize: options.optimizeImages,
    debug: options.debug,
  });

  // save meta.json
  const meta = {
    database,
    posts
  };
  const metaFilePath = join(options.output, "meta.json");
  writeFileSync(metaFilePath, JSON.stringify(meta, null, 2), "utf-8");
  console.log(`Saved meta data to ${metaFilePath}`);

  // save posts as markdown and HTML files
  for (const post of posts) {
    console.log(`Processing: ${post.title}`);

    let content = await client.getPostContent(post.id);

    const filenameMd = `${post.slug}.md`;
    const filepathMd = join(options.output, filenameMd);
    writeFileSync(filepathMd, content.markdown, "utf-8");

    if (content.html) {
      const filenameHtml = `${post.slug}.html`;
      const filepathHtml = join(options.output, filenameHtml);
      writeFileSync(filepathHtml, content.html, "utf-8");
    }

    if (options.downloadImages && options.imagedir && content.images) {
      console.log(`Downloading ${content.images.size} images for post ${post.id}...`);
      await downloadImagesWithRetry(post.id, content.images, client, {
        dir: imageDownloadDir,
        concurrency: options.concurrency,
        optimize: options.optimizeImages,
        debug: options.debug,
      });
    }

    console.log(`Saved: ${filepathMd}${content.html ? "/.html" : ""}`);
  }

  console.log("Done!");
}

main().catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});
