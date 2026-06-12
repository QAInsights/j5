import { parseDurationToMs } from "../plan/JmxSerializerHelpers.js";
import { TestPlan } from "../plan/TestPlan.js";

// ─── sleep ────────────────────────────────────────────────────────────────────
// Pauses thread execution for a constant duration.
// Example: sleep("1s")
export function sleep(duration: string): void {
  const ms = parseDurationToMs(duration);
  TestPlan.getInstance().addTimer({
    type: "timer",
    timerType: "constant",
    delay: String(ms),
  });
}

// ─── randomSleep ──────────────────────────────────────────────────────────────
// Pauses thread execution for a random duration between min and max.
// Example: randomSleep("500ms", "2s")
export function randomSleep(min: string, max: string): void {
  const minMs = parseDurationToMs(min);
  const maxMs = parseDurationToMs(max);
  const range = Math.max(0, maxMs - minMs);
  TestPlan.getInstance().addTimer({
    type: "timer",
    timerType: "uniform",
    delay: String(minMs),
    range: String(range),
  });
}

// ─── gaussianSleep ────────────────────────────────────────────────────────────
// Pauses thread execution with a gaussian (normal) distribution around a mean.
// Example: gaussianSleep("1.5s", "300ms")
export function gaussianSleep(mean: string, deviation: string): void {
  const meanMs = parseDurationToMs(mean);
  const devMs = parseDurationToMs(deviation);
  TestPlan.getInstance().addTimer({
    type: "timer",
    timerType: "gaussian",
    delay: String(meanMs),
    range: String(devMs),
  });
}
