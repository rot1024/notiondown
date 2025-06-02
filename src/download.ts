import fs from "node:fs";
import path from "node:path";

import { PromisePool } from "@supercharge/promise-pool";
import sharp from "sharp";

export async function downloadImages(
  images: Map<string, string> | null | undefined,
  {
    dir = "dist/images",
    concurrency = 3,
    optimize = true,
    debug = false,
    onDownloaded = (_imageUrl, localDest, buffer, _optimized) => {
      return fs.promises.writeFile(localDest, buffer);
    }
  }: {
    dir?: string;
    concurrency?: number;
    optimize?: boolean;
    debug?: boolean;
    onDownloaded?: (imageUrl: string, localDest: string, buffer: Buffer<ArrayBufferLike>, optimized: boolean) => Promise<void>;
  } = {}
): Promise<void> {
  if (!images || images.size === 0) return;

  await fs.promises.mkdir(dir, { recursive: true });

  const { errors } = await PromisePool.withConcurrency(concurrency)
    .for(images)
    .process(async ([imageUrl, localUrl]) => {
      const localName = path.basename(localUrl);
      const localDest = path.join(dir, localName);

      if (debug && await fs.promises.stat(localDest).catch(() => null)) {
        console.log(`astrotion: image: download skipped: ${imageUrl} -> ${localDest}`);
        return;
      }

      if (debug) {
        console.log(`astrotion: image: download: ${imageUrl} -> ${localDest}`);
      }

      const res = await fetch(imageUrl);
      if (res.status !== 200) {
        throw new Error(
          `Failed to download ${imageUrl} due to statu code ${res.status}`,
        );
      }

      const body = await res.arrayBuffer();

      const ext = path.extname(localUrl);
      if (optimize && ext === ".webp") {
        // optimize images
        const optimzied = await sharp(body).rotate().webp().toBuffer();
        if (debug) {
          console.log(
            "astrotion: image: optimized",
            localDest,
            `${body.byteLength} bytes -> ${optimzied.length} bytes`,
            `(${Math.floor((optimzied.length / body.byteLength) * 100)}%)`,
          );
        }
        await onDownloaded(imageUrl, localDest, optimzied, true);
      } else {
        const buf = Buffer.from(body);
        await onDownloaded(imageUrl, localDest, buf, false);
      }
    });

  if (errors.length > 0) {
    throw new Error(
      `Failed to download images: ${errors.map((e) => e.message).join(", ")}`,
    );
  }
}
