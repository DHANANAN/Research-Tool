/* Vercel's Node function connects the static client to the persistent Rust API.
 * Never put RESEARCH_BACKEND_URL in a VITE_* variable: configuration stays here.
 */
const MAX_BODY_BYTES = 4 * 1024 * 1024;

function jsonError(response, status, code, error) {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.end(JSON.stringify({ code, error }));
}

function backendOrigin(value) {
  if (!value) return null;
  const url = new URL(value);
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (
    (url.protocol !== "https:" && !(url.protocol === "http:" && loopback)) ||
    url.username || url.password || url.search || url.hash || url.pathname !== "/"
  ) throw new Error("Invalid backend origin");
  return url.origin;
}

function upstreamPath(request) {
  const incoming = new URL(request.url, "http://local.invalid");
  // vercel.json rewrites /api/:path* to this function with path in the query.
  const route = incoming.searchParams.get("path") || "";
  incoming.searchParams.delete("path");
  const segments = route.split("/");
  if (!route || segments.some(segment => !/^[A-Za-z0-9_~.-]+$/.test(segment) || segment === "." || segment === "..")) {
    throw new Error("Invalid API path");
  }
  return `/api/${segments.join("/")}${incoming.search}`;
}

async function requestBody(request) {
  if (["GET", "HEAD"].includes(request.method)) return undefined;
  let result;
  // The Vercel runtime can supply a parsed body. Keep raw PDF buffers intact.
  if (request.body !== undefined && request.body !== null) {
    result = Buffer.isBuffer(request.body) ? request.body :
      Buffer.from(typeof request.body === "string" ? request.body : JSON.stringify(request.body));
  } else {
    const chunks = [];
    let size = 0;
    for await (const chunk of request) {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += bytes.length;
      if (size > MAX_BODY_BYTES) throw new RangeError("Request too large");
      chunks.push(bytes);
    }
    result = Buffer.concat(chunks);
  }
  if (result.length > MAX_BODY_BYTES) throw new RangeError("Request too large");
  return result.length ? result : undefined;
}

function createProxy(getOrigin = () => process.env.RESEARCH_BACKEND_URL) {
  return async function proxy(request, response) {
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("X-Content-Type-Options", "nosniff");
    let origin;
    try { origin = backendOrigin(getOrigin()); }
    catch {
      return jsonError(response, 503, "backend_unavailable", "The research server connection needs configuration. Ask the deployment owner to set RESEARCH_BACKEND_URL to the Rust server's HTTPS origin.");
    }
    if (!origin) {
      return jsonError(response, 503, "backend_unavailable", "Online accounts and organizations need the research server. The deployment owner must connect it using RESEARCH_BACKEND_URL. You can still explore the guest playground.");
    }
    if (new URL(origin).host === request.headers.host) {
      return jsonError(response, 503, "backend_unavailable", "RESEARCH_BACKEND_URL must point to the Rust server, not back to this Vercel portal.");
    }
    let path;
    try { path = upstreamPath(request); }
    catch { return jsonError(response, 400, "invalid_api_path", "This API address is invalid."); }
    try {
      const body = await requestBody(request);
      const headers = new Headers();
      for (const name of ["accept", "content-type", "cookie", "x-research-client"]) {
        if (request.headers[name]) headers.set(name, request.headers[name]);
      }
      const upstream = await fetch(`${origin}${path}`, {
        method: request.method,
        headers,
        body,
        redirect: "manual",
        signal: AbortSignal.timeout(25000),
      });
      if (upstream.status >= 300 && upstream.status < 400) {
        return jsonError(response, 502, "backend_unavailable", "The configured research server redirected this API request. Use its final HTTPS origin in deployment settings.");
      }
      response.statusCode = upstream.status;
      for (const name of ["content-type", "content-disposition"]) {
        const value = upstream.headers.get(name);
        if (value) response.setHeader(name, value);
      }
      // Scope upstream session cookies to the frontend origin serving this proxy.
      const cookies = upstream.headers.getSetCookie();
      if (cookies.length) response.setHeader("Set-Cookie", cookies.map(cookie => cookie.replace(/;\s*Domain=[^;]+/gi, "")));
      response.end(Buffer.from(await upstream.arrayBuffer()));
    } catch (error) {
      if (error instanceof RangeError) return jsonError(response, 413, "upload_too_large", "This hosted portal accepts uploads up to 4 MiB. Split the questionnaire into smaller instruments or use pasted text.");
      return jsonError(response, 502, "backend_unavailable", "The research server could not be reached. Try again shortly; saved local work is retained.");
    }
  };
}

module.exports = createProxy();
module.exports.createProxy = createProxy;
