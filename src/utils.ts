import { extname, join } from "node:path";
import { DatabaseFilterOptions } from "./interfaces";
import { QueryDataSourceParameters } from "@notionhq/client/build/src/api-endpoints";
import { PropertyNames } from "./conv";

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

  const ext = extname(filename);
  let finalFilename = filename;

  // it may be animated gif, but sharp does not support converting it to animated webp
  if (ext !== ".gif") {
    // replace ext to webp
    const filenameWithoutExt =
      id || (ext ? filename.slice(0, -ext.length) : undefined);
    finalFilename = filenameWithoutExt
      ? filenameWithoutExt + ".webp"
      : filename;
  } else {
    // for gif files, use block ID but keep original extension
    finalFilename = id ? id + ext : filename;
  }

  if (!finalFilename) return imageUrl;

  const newUrl = join(dir, finalFilename);
  return newUrl;
}

function isUnsplash(url: URL): boolean {
  return url.hostname === "images.unsplash.com";
}

export function buildDatabaseFilter(filter: DatabaseFilterOptions, properties: PropertyNames): QueryDataSourceParameters["filter"] {
  const filters: any[] = [];

  // Published filter
  if (filter.published?.enabled) {
    filters.push({
      property: properties.published,
      checkbox: {
        equals: filter.published.value,
      },
    });
  }

  // Date filter
  if (filter.date?.enabled) {
    let dateValue = filter.date.value instanceof Date
      ? filter.date.value.toISOString()
      : filter.date.value || new Date().toISOString();

    if (isNaN(Date.parse(dateValue))) {
      dateValue = new Date().toISOString(); // Fallback to current date if invalid
    }

    filters.push({
      property: properties.date,
      date: {
        [filter.date.operator]: dateValue,
      },
    });
  }

  // Tags filter
  if (filter.tags?.enabled) {
    if (filter.tags.include?.length) {
      if (filter.tags.requireAll) {
        // AND condition: all tags must be present
        for (const tag of filter.tags.include) {
          filters.push({
            property: properties.tags,
            multi_select: {
              contains: tag,
            },
          });
        }
      } else {
        // OR condition: any of the tags
        filters.push({
          or: filter.tags.include.map(tag => ({
            property: properties.tags,
            multi_select: {
              contains: tag,
            },
          })),
        });
      }
    }

    if (filter.tags.exclude?.length) {
      for (const tag of filter.tags.exclude) {
        filters.push({
          property: properties.tags,
          multi_select: {
            does_not_contain: tag,
          },
        });
      }
    }
  }

  // Custom filters
  if (filter.customFilters?.length) {
    filters.push(...filter.customFilters);
  }

  return filters.length > 1 ? { and: filters } : filters[0] || undefined;
}
