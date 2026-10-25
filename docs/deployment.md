# Connect the public portal

The Vercel website builds the browser application. The Rust server and its SQLite database need a persistent server or container. A frontend-only Vercel deployment cannot execute the Rust API or retain the research database; requests such as `/api/auth/register` otherwise return 404 even when the account-creation screen loads.

This repository now includes a same-origin API proxy and SPA routing in `vercel.json`. An unconnected server returns an explanatory JSON `503 backend_unavailable` instead of an HTML 404. Guest playground access is separate from real online organization accounts and must be labeled accordingly.

## Deploy the Rust application

Use `Dockerfile` on a container host with a persistent writable volume mounted at `/data`. It builds the Rust API and browser application together and installs Poppler for PDF import. The service listens on port 3000, with health check `/api/health`. Publish it through the host's HTTPS endpoint.

```bash
docker build -t research-tool .
docker volume create research-tool-data
docker run --rm -p 3000:3000 -v research-tool-data:/data \
  -e RESEARCH_SECURE_COOKIES=false research-tool
```

The last command is a local HTTP example. An HTTPS deployment uses the image's default `RESEARCH_SECURE_COOKIES=true`. On an empty installation, the account/organization creation screen establishes an administrator; an existing database retains its accounts. Optional bootstrap environment variables are documented in [development.md](development.md).

The container runs as UID/GID `10001`. A bind-mounted directory or managed disk must be writable by that user; named Docker volumes inherit the prepared `/data` ownership on first use. Configure the host's volume permissions instead of making research data world-writable.

For a network using an organization-approved TLS proxy, the build accepts an optional BuildKit secret named `build_ca` containing its trusted CA bundle: `docker build --secret id=build_ca,src=/path/to/trusted-ca.pem -t research-tool .`. Standard Docker proxy build arguments can be supplied when required. The certificate is mounted only during package installation and compilation, is not copied into the image, and verification remains enabled. Ordinary hosts do not need this option.

`render.yaml` is an optional example for a Render container service with a persistent disk. It uses a **paid** plan because persistent SQLite requires durable storage. No hosting account, purchase, or public deployment is created by adding these files. Other hosts with persistent volumes can run the same image. Keep a single writable application instance while using this SQLite deployment design.

## Connect Vercel to that server

1. In the Vercel project, keep the repository root as the project's Root Directory so it sees both `api/` and `vercel.json`. The configuration builds `web/dist`; setting Root Directory to `web` hides the proxy and root routing.
2. Add the server-side environment variable `RESEARCH_BACKEND_URL` with the Rust server's HTTPS origin, for example `https://your-research-server.example`. Use the origin only, without `/api`, a trailing subpath, credentials, or query parameters. Do not use a `VITE_` variable for this setting.
3. Redeploy the Vercel project after changing the variable or Root Directory. Environment changes do not update an already built deployment.
4. Check the public site's `/api/health`: it should return HTTP 200 with `{"ok":true}`. If it returns a JSON 503, the proxy is installed but still needs the server setting. A JSON 502 indicates the configured upstream could not be reached.
5. Create an organization through the portal, sign out, and sign in again. Confirm persistence after restarting the Rust server. Check surveyor activation, collection, and Excel download before collecting participant data.

The proxy forwards authentication cookies, JSON, PDF bytes, and Excel downloads through the frontend's origin. The browser does not need third-party cookies or a cross-origin credential configuration. Cookies returned by the backend are scoped to the Vercel origin; cookie values and request payloads are never logged by the proxy.

Vercel functions have a platform request/response payload limit (commonly 4.5 MB). This proxy caps incoming uploads at **4 MiB** and reports a clear 413 error. The direct Rust application accepts PDFs up to 8 MiB; large questionnaire files should be split by instrument when using the Vercel proxy. Large Excel exports can also exceed the hosting platform's response limit; use the direct hosted Rust application or smaller export selections in that case.

## Check the proxy locally

```bash
node --test api/proxy.test.cjs
```

The tests start temporary local HTTP servers and check missing configuration, rejected origins and paths, organization-registration JSON, session cookies, binary PDF uploads, and binary XLSX downloads. They do not claim that a live Vercel deployment was updated. Public deployment credentials and a persistent backend origin are required to complete that external step.
