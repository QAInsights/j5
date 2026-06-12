import { TestPlan } from "../plan/TestPlan.js";
import type { GroupNode } from "../types/index.js";

// ─── group ────────────────────────────────────────────────────────────────────
// Groups a block of requests/timers into a single named transaction controller.
// Example:
//   group("Checkout Flow", () => {
//     registerSampler(httpSampler.get("Cart", "/cart"));
//     sleep("1s");
//     registerSampler(httpSampler.post("Checkout", "/checkout"));
//   });
export function group(name: string, fn: () => void): void {
  const plan = TestPlan.getInstance();
  const groupNode: GroupNode = {
    type: "group",
    name,
    children: [],
  };

  plan.addChild(groupNode);
  plan.pushContainer(groupNode.children);

  try {
    fn();
  } finally {
    plan.popContainer();
  }
}
