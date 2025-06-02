import path from "node:path";

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
