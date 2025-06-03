#!/usr/bin/env node

import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { Command } from "commander";
import { Client, downloadImages, downloadImagesWithRetry } from "./index.ts";
import pkg from "../package.json";

const program = new Command();

program
  .name(pkg.name)
  .description(pkg.description)
  .version(pkg.version)
  .requiredOption("--auth <key>", "Notion API key")
  .requiredOption("--db <id>", "Notion database ID")
  .option("--output <path>", "output directory", "dist")
  .option("--image-dir <path>", "image directory", "images")
  .option("--cache-dir <path>", "cache directory", "cache")
  .option("--format", "md,html, md, or html (default: md,html)")
  .option("--cache", "enable cache", true)
  .option("--download-images", "download images. If \"always\" is specified, overwrites existing images.", true)
  .option("--optimize-images", "convert images to WebP", true)
  .option("--page <id>", "generate only specific page by ID")
  .option("--debug", "enable debug mode", false);

async function main() {
  program.parse();
  const options = program.opts();
  const imageDownloadDir = join(options.output, options.imageDir);
  const format = (options.format as string || "md.html").split(",").map((f) => f.trim());

  const client = new Client({
    databaseId: options.db,
    auth: options.auth,
    cacheDir: options.cache ? options.cacheDir : undefined,
    imageDir: options.imageDir,
    debug: options.debug,
  });

  console.log("Loading cache...");
  await client.loadCache();

  let posts;
  let database;
  let images = new Map<string, string>();

  if (options.page) {
    // Generate only specific page
    console.log(`Fetching specific page: ${options.page}`);
    const post = await client.getPostById(options.page);
    if (!post) {
      console.error(`Page with ID ${options.page} not found or not accessible`);
      process.exit(1);
    }
    posts = [post];
    database = await client.getDatabase();

    // Collect images from database and the specific post
    if (database.images) {
      for (const [url, assetUrl] of Object.entries(database.images)) {
        images.set(url, assetUrl);
      }
    }
    if (post.images) {
      for (const [url, assetUrl] of Object.entries(post.images)) {
        images.set(url, assetUrl);
      }
    }

    console.log(`Found page: ${post.title}`);
  } else {
    // Generate all posts
    console.log("Fetching database and posts...");
    const result = await client.getDatabaseAndAllPosts();
    database = result.database;
    posts = result.posts;
    images = result.images;
    console.log(`Found ${posts.length} posts`);
  }

  mkdirSync(options.output, { recursive: true });

  // save meta.json
  const metaData = { ...database };
  delete metaData.images;
  const postsData = posts.map(post => {
    const postData = { ...post };
    delete postData.images;
    return postData;
  });
  const meta = { database: metaData, posts: postsData };
  const metaFilePath = join(options.output, "meta.json");
  writeFileSync(metaFilePath, JSON.stringify(meta, null, 2), "utf-8");
  console.log(`Saved meta data to ${metaFilePath}`);

  // download images
  if (options.downloadImages && images.size > 0) {
    console.log(`Found ${images.size} images to download`);
    await downloadImages(images, {
      dir: imageDownloadDir,
      concurrency: options.concurrency,
      optimize: options.optimizeImages,
      debug: options.debug,
      overwrite: options.downloadImages === "always",
    });
  }

  // save posts as markdown and HTML files
  for (const post of posts) {
    console.log(`Processing: ${post.title}`);

    let content = await client.getPostContent(post.id, posts);
    const ext = [];

    if (format.includes("md") && content.markdown) {
      const filenameMd = `${post.slug || post.id}.md`;
      const filepathMd = join(options.output, filenameMd);
      writeFileSync(filepathMd, content.markdown, "utf-8");
      ext.push("md");
    }

    if (format.includes("html") && content.html) {
      const filenameHtml = `${post.slug || post.id}.html`;
      const filepathHtml = join(options.output, filenameHtml);
      writeFileSync(filepathHtml, content.html, "utf-8");
      ext.push("html");
    }

    if (options.downloadImages && content.images && content.images.size > 0) {
      console.log(`Downloading ${content.images.size} images for post ${post.id}...`);
      await downloadImagesWithRetry(post.id, content.images, client, {
        dir: imageDownloadDir,
        concurrency: options.concurrency,
        optimize: options.optimizeImages,
        debug: options.debug,
        overwrite: options.downloadImages === "always",
      });
    }

    if (ext.length > 0) {
      console.log(`Saved: ${post.slug || post.id}.${ext.length > 1 ? "{" : ""}${ext.join(",")}${ext.length > 1 ? "}" : ""}`);
    }
  }

  console.log("Done!");
}

main().catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});
