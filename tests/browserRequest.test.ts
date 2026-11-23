import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { protectCookieWrites } from "../src/middleware/browserRequest.js";

function run(headers: Record<string, string>) {
  return new Promise<{ passed: boolean; status?: number }>((resolve) => {
    const req = {
      method: "POST",
      get(name: string) { return headers[name.toLowerCase()]; },
    } as never;
    const res = {
      status(code: number) { return { json() { resolve({ passed: false, status: code }); } }; },
    } as never;
    protectCookieWrites(req, res, () => resolve({ passed: true }));
  });
}

describe("cookie write browser boundary", () => {
  it("rejects cross-site browser writes carrying the session cookie", async () => {
    assert.equal((await run({ cookie: "dmr_session=secret", "sec-fetch-site": "cross-site" })).status, 403);
  });

  it("allows same-origin cookie writes and mobile Bearer requests", async () => {
    assert.equal((await run({ cookie: "dmr_session=secret", "sec-fetch-site": "same-origin", origin: "http://localhost:5173" })).passed, true);
    assert.equal((await run({ authorization: "Bearer mobile-token", "sec-fetch-site": "cross-site" })).passed, true);
  });
});
