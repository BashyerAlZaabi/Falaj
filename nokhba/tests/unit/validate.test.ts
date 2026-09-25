import { describe, expect, it } from "vitest";
import { z } from "zod";
import { MAX_UPLOAD_BYTES, parseBody, parseQuery, validateUpload } from "@/lib/security/validate";
import { HttpError } from "@/lib/auth/session";

const schema = z.object({ name: z.string().min(1), n: z.coerce.number().int().min(0).default(0) });

describe("parseBody", () => {
  it("returns typed data for a valid body", async () => {
    const req = new Request("http://x", { method: "POST", body: JSON.stringify({ name: "a", n: "3" }), headers: { "content-type": "application/json" } });
    await expect(parseBody(req, schema)).resolves.toEqual({ name: "a", n: 3 });
  });
  it("rejects invalid JSON and schema violations with 400", async () => {
    await expect(parseBody(new Request("http://x", { method: "POST", body: "{" }), schema)).rejects.toMatchObject({ status: 400 });
    const bad = new Request("http://x", { method: "POST", body: JSON.stringify({ name: "" }) });
    await expect(parseBody(bad, schema)).rejects.toBeInstanceOf(HttpError);
  });
});

describe("parseQuery", () => {
  it("parses search params", () => {
    expect(parseQuery("http://x/api?name=q&n=2", schema)).toEqual({ name: "q", n: 2 });
  });
  it("throws 400 on invalid params", () => {
    expect(() => parseQuery("http://x/api?n=-1&name=a", schema)).toThrow(HttpError);
  });
});

describe("validateUpload", () => {
  it("accepts allowed types under the size cap", () => {
    expect(() => validateUpload({ type: "application/pdf", size: 1024, name: "brief.pdf" })).not.toThrow();
  });
  it("rejects disallowed types, oversized files and executables", () => {
    expect(() => validateUpload({ type: "application/x-msdownload", size: 10, name: "a.bin" })).toThrow(/not allowed/);
    expect(() => validateUpload({ type: "application/pdf", size: MAX_UPLOAD_BYTES + 1, name: "big.pdf" })).toThrow(/25 MB/);
    expect(() => validateUpload({ type: "text/plain", size: 10, name: "run.sh" })).toThrow(/Executable/);
  });
});
