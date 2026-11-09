import { ApiError } from "@/lib/server/firebase-admin";

/** Enforce bytes while streaming; Content-Length alone is optional and attacker-controlled. */
export async function readBodyBytes(
  request: Request,
  maximum: number,
): Promise<Uint8Array> {
  const advertised = Number(request.headers.get("content-length") || 0);
  if (Number.isFinite(advertised) && advertised > maximum)
    throw new ApiError(413, "This request is too large.");
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maximum) {
        await reader.cancel();
        throw new ApiError(413, "This request is too large.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}
export async function readJsonBody(
  request: Request,
  maximum: number,
): Promise<unknown> {
  const contentType = request.headers.get("content-type");
  if (contentType && !/^application\/json(?:;|$)/i.test(contentType))
    throw new ApiError(415, "Use a JSON request.");
  const bytes = await readBodyBytes(request, maximum);
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new ApiError(400, "Invalid JSON request.");
  }
}
