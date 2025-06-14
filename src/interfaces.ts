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
  createdAt: string;
  updatedAt: string;
  excerpt: string;
  tags: Tag[];
  rank: number;
  lang?: string;
  raw?: any;
  icon?: string;
  cover?: string;
  featuredImage?: string;
  images?: Record<string, string>;
  additionalProperties?: Record<string, any>;
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

export type DatabaseFilterOptions = {
  published?: {
    enabled: boolean;
    value: boolean;
  };
  date?: {
    enabled: boolean;
    operator: 'on_or_before' | 'on_or_after' | 'equals' | 'before' | 'after';
    value?: string | Date;
  };
  tags?: {
    enabled: boolean;
    include?: string[];
    exclude?: string[];
    requireAll?: boolean;
  };
  customFilters?: any[];
};
