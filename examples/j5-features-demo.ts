import {
  httpSampler,
  registerSampler,
  sleep,
  randomSleep,
  gaussianSleep,
  group,
  type TestOptions,
} from "../src/index.js";

// Options configuring scenarios, thresholds and backend listeners
export const options: TestOptions = {
  scenarios: {
    browse: {
      executor: "constant-vus",
      vus: 5,
      duration: "30s",
      exec: "browseScenario",
    },
    checkout: {
      executor: "ramping-vus",
      vus: 2,
      rampUp: "10s",
      duration: "30s",
      exec: "checkoutScenario",
    },
  },
  thresholds: {
    "http_req_duration": ["p(95)<1000", "avg<500"],
    "http_req_duration{label=Checkout Item}": ["avg<1500"],
    "http_req_failed": ["rate<0.05"],
  },
  backends: [
    {
      type: "influxdb",
      server: "http://localhost:8086/write?db=j5_metrics",
      parameters: {
        application: "j5-demo",
      },
    },
    {
      type: "graphite",
      server: "localhost:2003",
    },
  ],
};

export const baseUrl = "https://example.com";

// Setup hook (runs once before main scenarios)
export function setup() {
  registerSampler(
    httpSampler.get("API Health Check", "/api/health")
      .assertStatus(200)
  );
  sleep("1s");
}

// Scenario 1: Browse
export function browseScenario() {
  group("Browse Flow", () => {
    registerSampler(
      httpSampler.get("Homepage", "/")
        .assertStatus(200)
    );
    randomSleep("500ms", "1.5s");

    registerSampler(
      httpSampler.get("Catalog", "/catalog")
        .assertStatus(200)
    );
    gaussianSleep("1s", "200ms");
  });
}

// Scenario 2: Checkout
export function checkoutScenario() {
  group("Checkout Flow", () => {
    registerSampler(
      httpSampler.get("Cart", "/cart")
        .assertStatus(200)
    );
    sleep("1s");

    registerSampler(
      httpSampler.post("Checkout Item", "/checkout", {
        body: { itemId: "item-123" },
      })
        .assertStatus(200)
    );
  });
}

// Teardown hook (runs once after main scenarios)
export function teardown() {
  registerSampler(
    httpSampler.post("Cleanup Session", "/api/logout")
  );
}
