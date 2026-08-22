import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { createPendingDeleteController } from "../shared/ui/pendingDelete.ts";

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Runtime proof of the Trip Recent bug and the hook fix:
 * React Strict Mode runs effect cleanup (dispose) then setup again.
 * requestDelete must go through a ref to the recreated controller.
 */
describe("usePendingDelete Strict Mode lifecycle", () => {
  const live: Array<ReturnType<typeof createPendingDeleteController<number>>> = [];
  afterEach(() => {
    for (const c of live) c.dispose();
    live.length = 0;
  });

  it("OLD hook: captured controller.requestDelete after dispose never DELETEs", async () => {
    let expired = 0;
    const controller = createPendingDeleteController<number>({
      seconds: 1,
      intervalMs: 25,
      onExpire: () => {
        expired += 1;
      },
      onChange: () => undefined,
    });
    live.push(controller);
    const requestDelete = controller.requestDelete;
    controller.dispose();
    requestDelete(1068);
    await wait(150);
    assert.equal(expired, 0);
  });

  it("NEW hook: dispose + null + recreate, requestDelete via ref DELETEs once", async () => {
    let expiredId: number | null = null;
    const make = () =>
      createPendingDeleteController<number>({
        seconds: 1,
        intervalMs: 25,
        onExpire: (id) => {
          expiredId = id;
        },
        onChange: () => undefined,
      });

    let controller: ReturnType<typeof make> | null = make();
    live.push(controller);
    const requestDelete = (id: number) => controller?.requestDelete(id);

    controller.dispose();
    controller = null;
    controller = make();
    live.push(controller);

    requestDelete(1068);
    await wait(200);
    assert.equal(expiredId, 1068);
  });
});
