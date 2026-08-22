import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  createPendingDeleteController,
  pendingDeleteBarPercent,
  pendingDeleteCountdownLabel,
} from "./pendingDelete.ts";

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const controllers: Array<ReturnType<typeof createPendingDeleteController<string | number>>> = [];

afterEach(() => {
  for (const controller of controllers) controller.dispose();
  controllers.length = 0;
});

function makeController(onExpire: (id: string | number) => void | Promise<void>) {
  const snapshots: Array<{ id: string | number; secondsLeft: number; committing: boolean }>[] = [];
  const controller = createPendingDeleteController<string | number>({
    seconds: 2,
    intervalMs: 25,
    onExpire,
    onChange: (items) => {
      snapshots.push(items);
    },
  });
  controllers.push(controller);
  return { controller, snapshots };
}

describe("createPendingDeleteController", () => {
  it("starts a countdown without calling delete", async () => {
    let expired = 0;
    const { controller, snapshots } = makeController(() => {
      expired += 1;
    });
    controller.requestDelete("a");
    assert.equal(snapshots[snapshots.length - 1]?.[0]?.secondsLeft, 2);
    await wait(10);
    assert.equal(expired, 0);
  });

  it("cancel during countdown does not delete", async () => {
    let expired = 0;
    const { controller, snapshots } = makeController(() => {
      expired += 1;
    });
    controller.requestDelete("a");
    await wait(20);
    controller.cancel("a");
    await wait(80);
    assert.equal(expired, 0);
    assert.deepEqual(snapshots[snapshots.length - 1], []);
  });

  it("calls delete once when countdown finishes", async () => {
    let expired = 0;
    const { controller } = makeController(() => {
      expired += 1;
    });
    controller.requestDelete("a");
    await wait(80);
    assert.equal(expired, 1);
  });

  it("ignores a second delete click on the same id", async () => {
    let expired = 0;
    const { controller } = makeController(() => {
      expired += 1;
    });
    controller.requestDelete("a");
    controller.requestDelete("a");
    await wait(80);
    assert.equal(expired, 1);
  });

  it("keeps independent rows on separate timers", async () => {
    const expired: Array<string | number> = [];
    const { controller } = makeController((id) => {
      expired.push(id);
    });
    controller.requestDelete("a");
    await wait(20);
    controller.requestDelete("b");
    controller.cancel("a");
    await wait(90);
    assert.deepEqual(expired, ["b"]);
  });

  it("restores pending state after a failed delete", async () => {
    const { controller, snapshots } = makeController(async () => {
      throw new Error("nope");
    });
    controller.requestDelete("a");
    await wait(90);
    assert.deepEqual(snapshots[snapshots.length - 1], []);
  });

  it("does not fire delete after dispose/unmount", async () => {
    let expired = 0;
    const { controller } = makeController(() => {
      expired += 1;
    });
    controller.requestDelete("a");
    controller.dispose();
    await wait(80);
    assert.equal(expired, 0);
  });

  it("disposed controller.requestDelete is a silent no-op (Strict Mode trap)", async () => {
    let expired = 0;
    const { controller } = makeController(() => {
      expired += 1;
    });
    const staleRequestDelete = controller.requestDelete;
    controller.dispose();
    staleRequestDelete("a");
    await wait(120);
    assert.equal(expired, 0);
  });

  it("recreate-after-dispose via ref still expires once", async () => {
    let expired = 0;
    const onExpire = () => {
      expired += 1;
    };
    let controller: ReturnType<typeof createPendingDeleteController<string | number>> | null =
      createPendingDeleteController({
        seconds: 1,
        intervalMs: 30,
        onExpire,
        onChange: () => undefined,
      });
    const requestDelete = (id: string) => controller?.requestDelete(id);

    controller.dispose();
    controller = null;
    controller = createPendingDeleteController({
      seconds: 1,
      intervalMs: 30,
      onExpire,
      onChange: () => undefined,
    });
    controllers.push(controller);

    requestDelete("a");
    await wait(200);
    assert.equal(expired, 1);
  });
});

describe("pending delete progress helpers", () => {
  it("maps 10s to a full bar and 0s to empty", () => {
    assert.equal(pendingDeleteBarPercent(10), 100);
    assert.equal(pendingDeleteBarPercent(5), 50);
    assert.equal(pendingDeleteBarPercent(1), 10);
    assert.equal(pendingDeleteBarPercent(0), 0);
  });

  it("uses singular second at 1", () => {
    assert.equal(pendingDeleteCountdownLabel(10), "Deleting in 10 seconds...");
    assert.equal(pendingDeleteCountdownLabel(1), "Deleting in 1 second...");
  });
});
