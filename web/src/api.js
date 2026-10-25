import { isDemoMode, demoRequest, demoWorkbook } from "./demo.js";

export class ApiError extends Error {
  constructor(message, status = 0) {
    super(message);
    this.status = status;
  }
}
export async function api(path, options = {}) {
  if (isDemoMode()) return demoRequest(path, options);
  const headers = new Headers(options.headers || {});
  const method = options.method || "GET";
  if (!["GET", "HEAD"].includes(method)) headers.set("X-Research-Client", "1");
  let body = options.body;
  if (
    body !== undefined &&
    !(body instanceof Blob) &&
    !(body instanceof ArrayBuffer)
  ) {
    headers.set("Content-Type", "application/json");
    body = JSON.stringify(body);
  }
  let response;
  try {
    response = await fetch(path, {
      ...options,
      headers,
      body,
      credentials: "same-origin",
      cache: "no-store",
    });
  } catch {
    throw new ApiError(
      "Unable to reach the server. Your saved local work is retained.",
    );
  }
  const contentType = response.headers.get("content-type") || "";
  const data = contentType.includes("application/json")
    ? await response.json()
    : null;
  if (!response.ok)
    throw new ApiError(
      data?.error ||
        (response.status === 404 || !contentType.includes("application/json")
          ? "The online account service is not connected at this website. You can explore the local playground while the site administrator connects the service."
          : `Request could not be completed (${response.status}).`),
      response.status,
    );
  if (!data)
    throw new ApiError(
      "The server returned an unexpected response. Please retry; local work has been kept.",
      response.status,
    );
  return data;
}
export async function downloadWorkbook(projectId, formId) {
  if (isDemoMode()) {
    const blob = await demoWorkbook(projectId, formId);
    saveWorkbook(blob);
    return;
  }
  let response;
  try {
    response = await fetch(
      `/api/projects/${projectId}/export.xlsx${formId ? `?form_id=${encodeURIComponent(formId)}` : ""}`,
      { credentials: "same-origin", cache: "no-store" },
    );
  } catch {
    throw new ApiError("Connect to the server to download the Excel workbook.");
  }
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new ApiError(
      data?.error || "The workbook could not be generated.",
      response.status,
    );
  }
  const blob = await response.blob();
  if (!(response.headers.get("content-type") || "").includes("spreadsheetml"))
    throw new ApiError("The server did not return an Excel workbook.");
  saveWorkbook(blob);
}
function saveWorkbook(blob) {
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);
  link.href = url;
  link.download = "research-responses.xlsx";
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
