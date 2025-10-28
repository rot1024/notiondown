import fs from "node:fs";
import { basename, extname, join } from "node:path";

import { PromisePool } from "@supercharge/promise-pool";
import sharp from "sharp";
import { type Client } from "./interfaces";

/**
 * Downloads assets (images, videos, audio) from a map of URLs to local paths.
 */
export async function downloadAssets(
  assets: Map<string, string> | null | undefined,
  {
    dir = "dist/images",
    concurrency = 3,
    optimize = true,
    overwrite = false,
    debug = false,
    onDownloaded: onSave = (_assetUrl, localDest, buffer, _optimized) => {
      return fs.promises.writeFile(localDest, buffer);
    }
  }: {
    dir?: string;
    concurrency?: number;
    optimize?: boolean;
    overwrite?: boolean;
    debug?: boolean;
    onDownloaded?: (assetUrl: string, localDest: string, buffer: Buffer<ArrayBufferLike>, optimized: boolean) => Promise<void>;
  } = {}
): Promise<void> {
  if (!assets || assets.size === 0) return;

  await fs.promises.mkdir(dir, { recursive: true });

  const { errors } = await PromisePool.withConcurrency(concurrency)
    .for(assets)
    .process(async ([assetUrl, localUrl]) => {
      if (!assetUrl || !localUrl) {
        if (debug) {
          console.warn(`notiondown: asset: skipping invalid asset URL: ${assetUrl} -> ${localUrl}`);
        }
        return;
      }

      const localName = basename(localUrl);
      if (!localName) {
        if (debug) {
          console.warn(`notiondown: asset: skipping invalid local URL: ${localUrl}`);
        }
        return;
      }

      const localDest = join(dir, localName);

      if (!overwrite && await fs.promises.stat(localDest).catch(() => null)) {
        if (debug) {
          console.log(`notiondown: asset: download skipped: ${assetUrl} -> ${localDest}`);
        }
        return;
      }

      if (debug) {
        console.log(`notiondown: asset: download: ${assetUrl} -> ${localDest}`);
      }

      const res = await fetch(assetUrl);
      if (res.status !== 200) {
        throw new Error(
          `Failed to download ${assetUrl} due to status code ${res.status}`,
        );
      }

      const body = await res.arrayBuffer();

      const ext = extname(localUrl);
      if (optimize && ext === ".webp") {
        // optimize images
        const optimzied = await sharp(body).rotate().webp().toBuffer();
        if (debug) {
          console.log(
            "notiondown: asset: optimized",
            localDest,
            `${body.byteLength} bytes -> ${optimzied.length} bytes`,
            `(${Math.floor((optimzied.length / body.byteLength) * 100)}%)`,
          );
        }
        await onSave(assetUrl, localDest, optimzied, true);
      } else {
        const buf = Buffer.from(body);
        await onSave(assetUrl, localDest, buf, false);
      }
    });

  if (errors.length > 0) {
    throw new Error(
      `Failed to download assets: ${errors.map((e) => e.message).join(", ")}`,
    );
  }
}

// Backward compatibility alias
export const downloadImages = downloadAssets;

/**
 * Downloads assets with retry logic for 403 errors.
 * If a 403 error occurs, it purges the cache for the specific post,
 * refetches the post content, and retries the asset download with fresh URLs.
 */
export async function downloadAssetsWithRetry(
  assets: Map<string, string> | null | undefined,
  postId: string,
  client: Client,
  options: {
    downloadAssets?: typeof downloadAssets;
  } & Parameters<typeof downloadAssets>[1]
): Promise<void> {
  try {
    await (options.downloadAssets ?? downloadAssets)(assets, options);
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

      if (freshContent.assets && freshContent.assets.size > 0) {
        console.log(`Retrying asset download with fresh URLs...`);
        try {
          await (options.downloadAssets ?? downloadAssets)(freshContent.assets, options);
          console.log(`Successfully downloaded assets after cache refresh.`);
        } catch (retryError) {
          console.error(`Failed to download assets even after cache refresh:`, retryError);
          throw retryError;
        }
      } else {
        console.log(`No assets found in fresh content.`);
      }
    } else {
      // Re-throw non-403 errors
      throw error;
    }
  }
}

// Backward compatibility alias
export const downloadImagesWithRetry = downloadAssetsWithRetry;
