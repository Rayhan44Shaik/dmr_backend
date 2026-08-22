import assert from "node:assert/strict";
import test from "node:test";
import { resolveStepperCompletion } from "./TripWizardStepper";

test("Step 5 uses the same completed mask as Steps 1–4", () => {
  const incompleteEnd = resolveStepperCompletion({
    start: true,
    farm: true,
    pickup: true,
    delivery: true,
    end: false,
  });
  assert.deepEqual(incompleteEnd, [true, true, true, true, false]);

  const complete = resolveStepperCompletion({
    start: true,
    farm: true,
    pickup: true,
    delivery: true,
    end: true,
  });
  assert.deepEqual(complete, [true, true, true, true, true]);
});
