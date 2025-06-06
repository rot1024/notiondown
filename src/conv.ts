import type {
  DatabaseObjectResponse,
  GetDatabaseResponse,
  PageObjectResponse,
  PartialDatabaseObjectResponse,
  PartialPageObjectResponse,
} from "@notionhq/client/build/src/api-endpoints";

import type { Database, Post } from "./interfaces.ts";
import { type Properties } from "./notion/index.ts";
import { fileUrlToAssetUrl } from "./utils.ts";

export type PropertyNames = {
  /** Title property (title, default: Title) */
  title?: string;
  /** Slug property (text, default: Slug) */
  slug?: string;
  /** Published property (checkbox, default: Published) */
  published?: string;
  /** Date property (date, default: Date) */
  date?: string;
  /** FeatureImage property (file, default: FeatureImage) */
  featuredImage?: string;
  /** Tags property (multi_select, default: Tags) */
  tags?: string;
  /** Excerpt property (text, default: Excerpt) */
  excerpt?: string;
  /** Rank property (number, default: Rank) */
  rank?: string;
  /** CreatedAt property (created_time, default: CreatedAt) */
  createdAt?: string;
  /** UpdatedAt property (last_edited_time, default: UpdatedAt) */
  updatedAt?: string;
};

export const DEFAULT_PROPERTY_NAMES: Required<PropertyNames> = {
  title: "Title",
  slug: "Slug",
  date: "Date",
  published: "Published",
  featuredImage: "FeaturedImage",
  tags: "Tags",
  excerpt: "Excerpt",
  rank: "Rank",
  createdAt: "CreatedAt",
  updatedAt: "UpdatedAt",
};

const propertyTypes: Record<keyof PropertyNames, string> = {
  title: "title",
  slug: "rich_text",
  published: "checkbox",
  date: "date",
  featuredImage: "files",
  tags: "multi_select",
  excerpt: "rich_text",
  rank: "number",
  createdAt: "created_time",
  updatedAt: "last_edited_time",
}

export function buildDatabase(res: GetDatabaseResponse, dir?: string): Database {
  if (!("title" in res)) throw new Error("invalid database");

  const { url: iconUrl } = getUrlFromIconAndCover(res.icon) ?? {};
  const { url: coverUrl } = getUrlFromIconAndCover(res.cover) ?? {};
  const iconAssetUrl = fileUrlToAssetUrl(iconUrl, res.id + "_icon", dir);
  const coverAssetUrl = fileUrlToAssetUrl(coverUrl, res.id + "_cover", dir);

  const images: Record<string, string> = {}
  if (iconUrl && iconAssetUrl) images[iconUrl] = iconAssetUrl;
  if (coverUrl && coverAssetUrl) images[coverUrl] = coverAssetUrl;

  return {
    title: res.title.map((text) => text.plain_text).join(""),
    description: res.description.map((text) => text.plain_text).join(""),
    icon: iconAssetUrl || iconUrl,
    cover: coverAssetUrl || coverUrl,
    images,
  };
}

export function isValidPage(
  p:
    | PageObjectResponse
    | PartialPageObjectResponse
    | PartialDatabaseObjectResponse
    | DatabaseObjectResponse,
  propertyNames?: Partial<PropertyNames>,
  debug = false,
): p is PageObjectResponse {
  const names: Required<PropertyNames> = { ...DEFAULT_PROPERTY_NAMES, ...propertyNames };
  const properties = "properties" in p ? p.properties : null;
  if (!properties) return false;

  const titleProp = properties[names.title];
  if (!titleProp || titleProp.type !== "title" || titleProp.title.length === 0) {
    if (debug) {
      console.warn("notiondown: page does not have a valid title property");
    }
    return false;
  }

  for (const [k, v] of Object.entries(names)) {
    const p = properties[v];
    if (!p) continue;

    if (p.type !== propertyTypes[k as keyof typeof propertyTypes]) {
      if (debug) {
        console.warn(
          `notiondown: property "${v}" is not of type "${propertyTypes[k as keyof typeof propertyTypes]}"`,
        );
      }
      return false;
    }
  }

  return true
}

export function buildPost(
  pageObject: PageObjectResponse,
  dir?: string,
  propertyNames?: Partial<PropertyNames>
): Post {
  const names = { ...DEFAULT_PROPERTY_NAMES, ...propertyNames };
  const { properties, id, icon, cover } = pageObject;
  const { url: iconUrl } = getUrlFromIconAndCover(icon) ?? {};
  const { url: coverUrl } = getUrlFromIconAndCover(cover) ?? {};
  const { url: featuredImageUrl } =
    getUrlFromIconAndCover(properties[names.featuredImage]) ?? {};
  const iconAssetUrl = fileUrlToAssetUrl(iconUrl, id + "_icon", dir);
  const coverAssetUrl = fileUrlToAssetUrl(coverUrl, id + "_cover", dir);
  const featuredImageAssetUrl = fileUrlToAssetUrl(
    featuredImageUrl,
    id + "_featured",
    dir,
  );

  const images: Record<string, string> = {};
  if (iconUrl && iconAssetUrl) images[iconUrl] = iconAssetUrl;
  if (coverUrl && coverAssetUrl) images[coverUrl] = coverAssetUrl;
  if (featuredImageUrl && featuredImageAssetUrl)
    images[featuredImageUrl] = featuredImageAssetUrl;

  const dateProp = properties[names.date];
  const tagsProp = properties[names.tags];
  const rankProp = properties[names.rank];
  const createdAtProp = properties[names.createdAt];
  const updatedAtProp = properties[names.updatedAt];

  const title = getRichText(properties[names.title]);
  const slugText = getRichText(properties[names.slug]);

  // Use title as slug fallback if slug is empty
  const slug = slugText || title;

  // Date fallback logic: Date -> CreatedAt -> UpdatedAt
  let date = "";
  if (dateProp?.type === "date" && dateProp.date?.start) {
    date = dateProp.date.start;
  } else if (createdAtProp?.type === "created_time") {
    date = createdAtProp.created_time;
  } else if (updatedAtProp?.type === "last_edited_time") {
    date = updatedAtProp.last_edited_time;
  }

  const post: Post = {
    id: id,
    title,
    icon: iconAssetUrl || iconUrl,
    cover: coverAssetUrl || coverUrl,
    featuredImage: featuredImageAssetUrl || featuredImageUrl,
    slug,
    date,
    tags:
      tagsProp?.type === "multi_select"
        ? tagsProp.multi_select
        : [],
    excerpt: getRichText(properties[names.excerpt]),
    rank: rankProp?.type === "number" ? rankProp.number ?? 0 : 0,
    createdAt: createdAtProp?.type === "created_time"
      ? createdAtProp.created_time : "",
    updatedAt:
      updatedAtProp?.type === "last_edited_time"
        ? updatedAtProp.last_edited_time
        : "",
    images,
  };

  return post;
}

function getRichText(p: Properties | undefined): string {
  if (!p) return "";
  return p.type === "rich_text"
    ? p.rich_text.map((richText) => richText.plain_text).join("")
    : p.type === "title" && p.title.length > 0
      ? p.title[0].plain_text
      : "";
}

export function getUrlFromIconAndCover(
  iconOrCover:
    | PageObjectResponse["icon"]
    | PageObjectResponse["cover"]
    | Properties
    | undefined,
): { url: string; expiryTime?: Date } | undefined {
  if (iconOrCover?.type === "external") {
    return {
      url: iconOrCover.external.url,
    };
  }

  if (iconOrCover?.type === "file") {
    return {
      url: iconOrCover.file.url,
      expiryTime: new Date(iconOrCover.file.expiry_time),
    };
  }

  if (iconOrCover?.type === "files") {
    const f = iconOrCover.files[0];
    if (f) {
      if (f.type === "external") return { url: f.external.url };
      if (f.type === "file")
        return { url: f.file.url, expiryTime: new Date(f.file.expiry_time) };
    }
  }

  return;
}
