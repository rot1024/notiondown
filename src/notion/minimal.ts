import type {
  GetDatabaseParameters,
  GetDatabaseResponse,
  GetPageParameters,
  GetPageResponse,
  ListBlockChildrenParameters,
  ListBlockChildrenResponse,
  QueryDataSourceParameters,
  QueryDataSourceResponse,
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
    retrieve: (args: GetDatabaseParameters) => Promise<GetDatabaseResponse>;
  };
  dataSources: {
    query(args: QueryDataSourceParameters): Promise<QueryDataSourceResponse>;
  };
  pages: {
    retrieve: (args: GetPageParameters) => Promise<GetPageResponse>;
  };
};
