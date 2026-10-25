const assert = require("node:assert/strict");
const http = require("node:http");
const { test } = require("node:test");
const { createProxy } = require("./proxy.js");

async function listening(handler) {
  const server = http.createServer(handler);
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  return { server, origin: `http://127.0.0.1:${server.address().port}` };
}
async function close(server) { await new Promise(resolve => server.close(resolve)); }

test("missing or invalid Rust origin produces an actionable JSON error, not a 404", async () => {
  for (const configured of [undefined, "https://user:password@example.invalid", "http://example.invalid", "https://example.invalid/unexpected"]) {
    const proxy = await listening(createProxy(() => configured));
    try {
      const result = await fetch(`${proxy.origin}/api/proxy?path=auth/register`, { method: "POST" });
      assert.equal(result.status, 503);
      assert.equal(result.headers.get("cache-control"), "no-store");
      assert.equal((await result.json()).code, "backend_unavailable");
    } finally { await close(proxy.server); }
  }
});

test("same-origin proxy retains authenticated JSON, binary uploads/downloads and session cookies", async () => {
  const calls = [];
  const workbook = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0xff, 0x00]);
  const backend = await listening(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    calls.push({ path: request.url, body: Buffer.concat(chunks), headers: request.headers });
    if (request.url.startsWith("/api/projects/p/export.xlsx")) {
      response.setHeader("content-type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      response.setHeader("content-disposition", 'attachment; filename="responses.xlsx"');
      return response.end(workbook);
    }
    response.setHeader("content-type", "application/json");
    response.setHeader("set-cookie", ["research_session=fictional; HttpOnly; SameSite=Lax; Secure; Domain=backend.invalid; Path=/", "other=fictional; Path=/"]);
    response.end(JSON.stringify({ ok: true }));
  });
  const proxy = await listening(createProxy(() => backend.origin));
  try {
    let result = await fetch(`${proxy.origin}/api/proxy?path=auth/register`, {
      method: "POST", headers: { "content-type": "application/json", "x-research-client": "1", cookie: "research_session=fictional" }, body: JSON.stringify({ org_name: "Fictional organization" }),
    });
    assert.equal(result.status, 200);
    assert.equal(calls[0].path, "/api/auth/register");
    assert.equal(JSON.parse(calls[0].body).org_name, "Fictional organization");
    assert.equal(calls[0].headers["x-research-client"], "1");
    assert.equal(calls[0].headers.cookie, "research_session=fictional");
    assert.equal(result.headers.getSetCookie().length, 2);
    assert(!result.headers.getSetCookie()[0].includes("Domain="));
    const pdf = Buffer.from([0x25, 0x50, 0x44, 0x46, 0xff, 0x00]);
    result = await fetch(`${proxy.origin}/api/proxy?path=projects/p/import-pdf`, { method: "POST", headers: { "content-type": "application/pdf" }, body: pdf });
    assert.equal(result.status, 200);
    assert.deepEqual(calls[1].body, pdf);
    result = await fetch(`${proxy.origin}/api/proxy?path=projects/p/export.xlsx&form_id=f`);
    assert.deepEqual(Buffer.from(await result.arrayBuffer()), workbook);
    assert.equal(calls[2].path, "/api/projects/p/export.xlsx?form_id=f");
    assert.match(result.headers.get("content-disposition"), /responses.xlsx/);
    result = await fetch(`${proxy.origin}/api/proxy?path=../private`);
    assert.equal(result.status, 400);
    assert.equal(calls.length, 3);
  } finally { await close(proxy.server); await close(backend.server); }
});
