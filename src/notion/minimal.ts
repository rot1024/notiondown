import type {
  GetDataSourceParameters,
  GetDataSourceResponse,
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
  dataSources: {
    retrieve: (args: GetDataSourceParameters) => Promise<GetDataSourceResponse>;
    query(args: QueryDataSourceParameters): Promise<QueryDataSourceResponse>;
  };
  pages: {
    retrieve: (args: GetPageParameters) => Promise<GetPageResponse>;
  };
};
