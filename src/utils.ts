import path from "node:path";

import { format } from "date-fns";

import type { Post } from "./interfaces.ts";

export function mergeMaps<K, V>(
  ...maps: (Map<K, V> | null | undefined)[]
): Map<K, V> {
  const result = new Map<K, V>();
  maps.forEach((map) => {
    if (!map) return;

    map.forEach((v, k) => {
      result.set(k, v);
    });
  });
  return result;
}

export function formatPostDate(date: string, dateFormat?: string): string {
  return format(new Date(date), dateFormat || "yyyy-MM-dd");
}

export function fileUrlToAssetUrl(
  imageUrl: string | undefined,
  id: string,
  dir: string = ""
): string | undefined {
  if (!imageUrl) return undefined; // should not download

  const url = new URL(imageUrl);
  if (!url.searchParams.has("X-Amz-Expires") && !isUnsplash(url)) {
    return undefined; // should not download
  }

  const filename = url.pathname.split("/").at(-1);
  if (!filename) return imageUrl;

  const ext = path.extname(filename);
  let finalFilename = filename;

  // it may be animated gif, but sharp does not support converting it to animated webp
  if (ext !== ".gif") {
    // replace ext to webp
    const filenameWithoutExt =
      id || (ext ? filename.slice(0, -ext.length) : undefined);
    finalFilename = filenameWithoutExt
      ? filenameWithoutExt + ".webp"
      : filename;
  }

  const newUrl = path.join(dir, finalFilename);
  return newUrl;
}

function isUnsplash(url: URL): boolean {
  return url.hostname === "images.unsplash.com";
}
