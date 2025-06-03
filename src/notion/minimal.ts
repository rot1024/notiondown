import type {
  GetDatabaseParameters,
  GetDatabaseResponse,
  GetPageParameters,
  GetPageResponse,
  ListBlockChildrenParameters,
  ListBlockChildrenResponse,
  QueryDatabaseParameters,
  QueryDatabaseResponse,
} from "@notionhq/client/build/src/api-endpoints";

export type MinimalNotionClient = {
  blocks: {
    children: {
      list(
        args: ListBlockChildrenParameters,
      ): Promise<ListBlockChildrenResponse>;
    };
  };
  databases: {
    query(args: QueryDatabaseParameters): Promise<QueryDatabaseResponse>;
    retrieve: (args: GetDatabaseParameters) => Promise<GetDatabaseResponse>;
  };
  pages: {
    retrieve: (args: GetPageParameters) => Promise<GetPageResponse>;
  };
};
