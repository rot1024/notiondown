import { Client } from ".";

// TODO: get options from arguments

const client = new Client("", {})

const [db, posts] = await client
  .loadCache()
  .then(() =>
    Promise.all([
      client.getDatabase(),
      client.getAllPosts(),
    ]),
  );
