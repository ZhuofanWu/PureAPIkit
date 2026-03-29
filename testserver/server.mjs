import { createServer } from "node:http";

const host = process.env.ECHO_SERVER_HOST || "127.0.0.1";
const port = Number(process.env.ECHO_SERVER_PORT || 3001);

function collectRequestBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];

    request.on("data", (chunk) => {
      chunks.push(chunk);
    });

    request.on("end", () => {
      const buffer = Buffer.concat(chunks);
      const text = buffer.toString("utf8");

      resolve({
        size: buffer.length,
        text,
        base64: buffer.toString("base64"),
      });
    });

    request.on("error", reject);
  });
}

const server = createServer(async (request, response) => {
  try {
    const body = await collectRequestBody(request);

    const payload = {
      ok: true,
      method: request.method,
      url: request.url,
      httpVersion: request.httpVersion,
      remoteAddress: request.socket.remoteAddress,
      remotePort: request.socket.remotePort,
      headers: request.headers,
      body,
      receivedAt: new Date().toISOString(),
    };

    response.writeHead(200, {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "*",
      "Access-Control-Allow-Methods": "*",
    });
    response.end(JSON.stringify(payload, null, 2));
  } catch (error) {
    response.writeHead(500, {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "*",
      "Access-Control-Allow-Methods": "*",
    });
    response.end(
      JSON.stringify(
        {
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        },
        null,
        2,
      ),
    );
  }
});

server.listen(port, host, () => {
  console.log(`Echo server listening on http://${host}:${port}`);
});

