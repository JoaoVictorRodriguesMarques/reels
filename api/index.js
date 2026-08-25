export const config = {
  runtime: "edge",
};

import server from "../dist/server/index.js";

export default async function handler(request) {
  const handlerObj = server.default || server;
  return handlerObj.fetch(request, {}, {});
}
