import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";

const http = httpRouter();

http.route({
  path: "/health",
  method: "GET",
  handler: httpAction(async () => new Response(JSON.stringify({ ok: true, service: "finalframe-convex" }), { status: 200, headers: { "content-type": "application/json" } })),
});

export default http;
