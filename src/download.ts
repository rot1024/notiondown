import fs from "node:fs";
import { basename, extname, join } from "node:path";

import { PromisePool } from "@supercharge/promise-pool";
import sharp from "sharp";
import { type Client } from "./interfaces";

/**
 * Downloads images from a map of image URLs to local paths.
 */
export async function downloadImages(
  images: Map<string, string> | null | undefined,
  {
    dir = "dist/images",
    concurrency = 3,
    optimize = true,
    overwrite = false,
    debug = false,
    onDownloaded: onSave = (_imageUrl, localDest, buffer, _optimized) => {
      return fs.promises.writeFile(localDest, buffer);
    }
  }: {
    dir?: string;
    concurrency?: number;
    optimize?: boolean;
    overwrite?: boolean;
    debug?: boolean;
    onDownloaded?: (imageUrl: string, localDest: string, buffer: Buffer<ArrayBufferLike>, optimized: boolean) => Promise<void>;
  } = {}
): Promise<void> {
  if (!images || images.size === 0) return;

  await fs.promises.mkdir(dir, { recursive: true });

  const { errors } = await PromisePool.withConcurrency(concurrency)
    .for(images)
    .process(async ([imageUrl, localUrl]) => {
      if (!imageUrl || !localUrl) {
        if (debug) {
          console.warn(`notiondown: image: skipping invalid image URL: ${imageUrl} -> ${localUrl}`);
        }
        return;
      }

      const localName = basename(localUrl);
      if (!localName) {
        if (debug) {
          console.warn(`notiondown: image: skipping invalid local URL: ${localUrl}`);
        }
        return;
      }

      const localDest = join(dir, localName);

      if (!overwrite && await fs.promises.stat(localDest).catch(() => null)) {
        if (debug) {
          console.log(`notiondown: image: download skipped: ${imageUrl} -> ${localDest}`);
        }
        return;
      }

      if (debug) {
        console.log(`notiondown: image: download: ${imageUrl} -> ${localDest}`);
      }

      const res = await fetch(imageUrl);
      if (res.status !== 200) {
        throw new Error(
          `Failed to download ${imageUrl} due to statu code ${res.status}`,
        );
      }

      const body = await res.arrayBuffer();

      const ext = extname(localUrl);
      if (optimize && ext === ".webp") {
        // optimize images
        const optimzied = await sharp(body).rotate().webp().toBuffer();
        if (debug) {
          console.log(
            "notiondown: image: optimized",
            localDest,
            `${body.byteLength} bytes -> ${optimzied.length} bytes`,
            `(${Math.floor((optimzied.length / body.byteLength) * 100)}%)`,
          );
        }
        await onSave(imageUrl, localDest, optimzied, true);
      } else {
        const buf = Buffer.from(body);
        await onSave(imageUrl, localDest, buf, false);
      }
    });

  if (errors.length > 0) {
    throw new Error(
      `Failed to download images: ${errors.map((e) => e.message).join(", ")}`,
    );
  }
}

/**
 * Downloads images with retry logic for 403 errors.
 * If a 403 error occurs, it purges the cache for the specific post,
 * refetches the post content, and retries the image download with fresh URLs.
 */
export async function downloadImagesWithRetry(
  images: Map<string, string> | null | undefined,
  postId: string,
  client: Client,
  options: {
    downloadImages?: typeof downloadImages;
  } & Parameters<typeof downloadImages>[1]
): Promise<void> {
  try {
    await (options.downloadImages ?? downloadImages)(images, options);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    // Check if error contains 403 status code
    if (errorMessage.includes("403")) {
      console.log(`403 error detected for post ${postId}. Purging cache and retrying...`);

      // Purge cache for this specific post
      await client.purgeCacheById(postId);

      // Refetch the post content with fresh data from Notion
      console.log(`Refetching fresh content for post ${postId}...`);
      const freshContent = await client.getPostContent(postId);

      if (freshContent.images && freshContent.images.size > 0) {
        console.log(`Retrying image download with fresh URLs...`);
        try {
          await (options.downloadImages ?? downloadImages)(freshContent.images, options);
          console.log(`Successfully downloaded images after cache refresh.`);
        } catch (retryError) {
          console.error(`Failed to download images even after cache refresh:`, retryError);
          throw retryError;
        }
      } else {
        console.log(`No images found in fresh content.`);
      }
    } else {
      // Re-throw non-403 errors
      throw error;
    }
  }
}
