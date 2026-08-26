import path from "node:path";
import url from "node:url";

let serverPromise;
async function getServer() {
  if (!serverPromise) {
    const serverPath = path.resolve(process.cwd(), "dist/server/server.js");
    serverPromise = import(url.pathToFileURL(serverPath).href).then(
      (m) => m.default?.default || m.default
    );
  }
  return serverPromise;
}

export default async function handler(req, res) {
  try {
    const server = await getServer();
    const protocol = req.headers["x-forwarded-proto"] || "https";
    const host = req.headers["x-forwarded-host"] || req.headers.host || "localhost";
    const fullUrl = `${protocol}://${host}${req.url}`;

    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) {
      if (value !== undefined) {
        if (Array.isArray(value)) {
          value.forEach((v) => headers.append(key, v));
        } else {
          headers.set(key, value);
        }
      }
    }

    let body = undefined;
    if (req.method !== "GET" && req.method !== "HEAD") {
      const chunks = [];
      for await (const chunk of req) {
        chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
      }
      body = Buffer.concat(chunks);
    }

    const webReq = new Request(fullUrl, {
      method: req.method,
      headers,
      body,
    });
    const webRes = await server.fetch(webReq, {}, {});

    res.statusCode = webRes.status;
    webRes.headers.forEach((val, key) => {
      res.setHeader(key, val);
    });

    const arrayBuffer = await webRes.arrayBuffer();
    res.end(Buffer.from(arrayBuffer));
  } catch (err) {
    console.error("Vercel handler error:", err);
    res.statusCode = 500;
    res.setHeader("content-type", "text/plain; charset=utf-8");
    res.end(err.stack || String(err));
  }
}
