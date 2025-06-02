export type Client = {
  getDatabase(): Promise<Database>;
  getAllPosts(): Promise<Post[]>;
  getDatabaseAndAllPosts(): Promise<{
    database: Database;
    posts: Post[];
    images: Map<string, string>;
  }>;
  getPostContent(postId: string): Promise<PostContent>;
  loadCache(): Promise<void>;
  purgeCache(): Promise<void>;
  purgeCacheById(id: string): Promise<void>;
};

export type Database = {
  title: string;
  description: string;
  icon?: string;
  cover?: string;
  images?: Record<string, string>;
};

export type Post = {
  id: string;
  title: string;
  slug: string;
  date: string;
  updatedAt: string;
  excerpt: string;
  tags: Tag[];
  rank: number;
  raw?: any;
  icon?: string;
  cover?: string;
  featuredImage?: string;
  images?: Record<string, string>;
};

export type PostContent = {
  markdown: string;
  html: string;
  images?: Map<string, string>;
};

export type Tag = {
  id: string;
  name: string;
  color?: string;
};
