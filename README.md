# j5 🚀

<p align="center">
  <a href="https://www.npmjs.com/package/j5"><img src="https://img.shields.io/npm/v/j5.svg?style=flat-square&color=33cd56" alt="NPM Version"></a>
  <a href="https://github.com/QAInsights/j5/blob/main/LICENSE"><img src="https://img.shields.io/npm/l/j5.svg?style=flat-square&color=blue" alt="License"></a>
  <a href="https://github.com/vitest-dev/vitest"><img src="https://img.shields.io/badge/tested%20with-vitest-db820b.svg?style=flat-square" alt="Tested with Vitest"></a>
</p>

<p align="center">
  <b>Write JMeter performance tests like k6</b>, written in modern TypeScript, with no GUI, no XML, and native support for lifecycle hooks, scenarios, thresholds, and real-time backend listeners.
</p>

---

## 🌟 Why j5?

*   **TypeScript/JavaScript First**: Write clean, modular, and type-safe performance scripts. No more clicking through complex Java Swing GUIs.
*   **Zero XML Boilerplate**: No more editing or merging thousands of lines of fragile `.jmx` XML files.
*   **k6-Style DSL**: Includes familiar exports like `options` (for VUs, duration, and named scenarios), `setup`/`teardown` hooks, and metric-based `thresholds`.
*   **Pure Apache JMeter**: Generates standard, optimized, vanilla JMX files. It runs on any vanilla JMeter installation with zero extra plugin requirements.

---

## 🛠️ How It Works

```
[your-script.ts]  ── j5 compile ──>  [test-plan.jmx]  ── jmeter -n ──>  [results.jtl]
```

1. **Write**: Define your test scenarios, assertions, think times, and data sets using the `j5` TypeScript API.
2. **Compile**: `j5` validates your script, executes exports, and serializes the structure into a valid JMeter-compatible JMX file.
3. **Execute**: JMeter runs headlessly against the generated JMX and outputs native performance metrics to a JTL file.

---

## ⚡ Quick Start

### 1. Installation

```bash
# Install locally in your project
npm install --save-dev j5
```

> **Prerequisite:** [Apache JMeter 5.6+](https://jmeter.apache.org/) must be installed. Make sure `jmeter` is in your system `PATH` or configure `JMETER_HOME`.

### 2. Create your first test script (`simple-test.ts`)

```typescript
import { httpSampler, registerSampler, type TestOptions } from "j5";

// 1. Configure the load profile
export const options: TestOptions = {
  vus: 10,
  duration: "30s",
};

// 2. Define the target base URL
export const baseUrl = "https://api.example.com";

// 3. Define the main test execution
export default function () {
  registerSampler(
    httpSampler
      .get("Get Homepage", "/")
      .assertStatus(200)
  );
}
```

### 3. Run the test

```bash
# Compile and run via JMeter CLI
npx j5 run simple-test.ts

# Generate JMX XML only (dry-run)
npx j5 run simple-test.ts --dry-run
```

---

## 🚀 Advanced Features Demo

`j5` supports robust scenario executors, custom think times, metrics thresholds, and real-time database endpoints (InfluxDB & Graphite):

```typescript
import {
  httpSampler,
  registerSampler,
  sleep,
  randomSleep,
  gaussianSleep,
  group,
  type TestOptions,
} from "j5";

export const baseUrl = "https://shop.example.com";

export const options: TestOptions = {
  scenarios: {
    browse: {
      executor: "constant-vus",
      vus: 5,
      duration: "1m",
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
    "http_req_failed": ["rate<0.02"],
  },
  backends: [
    {
      type: "influxdb",
      server: "http://localhost:8086/write?db=j5_metrics",
      parameters: { application: "e-commerce-j5" }
    }
  ]
};

// Setup hook (runs once before main scenarios)
export function setup() {
  registerSampler(
    httpSampler.get("API Health Check", "/api/health").assertStatus(200)
  );
}

// Named Scenario: Browse
export function browseScenario() {
  group("Catalog Flow", () => {
    registerSampler(
      httpSampler.get("Homepage", "/")
    );
    randomSleep("500ms", "1.5s");

    registerSampler(
      httpSampler.get("Catalog", "/catalog").assertStatus(200)
    );
    gaussianSleep("1s", "200ms");
  });
}

// Named Scenario: Checkout
export function checkoutScenario() {
  group("Checkout Flow", () => {
    registerSampler(
      httpSampler.get("Cart", "/cart")
    );
    sleep("1s");

    registerSampler(
      httpSampler.post("Checkout Item", "/checkout", { body: { itemId: "99" } })
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
```

---

## 💻 CLI Command Reference

### `j5 run <script>`
Compiles your TypeScript script to a JMX file and runs it with Apache JMeter.

*   `--dry-run`: Generate JMX only; do not execute JMeter.
*   `--out <path>`: Custom destination path for the generated JMX.
*   `--jtl <path>`: Custom path for the `.jtl` results file.
*   `--jmeter-bin <path>`: Path to your JMeter binary executable (overrides `JMETER_HOME`).
*   `--extra-args <args>`: Extra arguments to pass to the underlying JMeter CLI (e.g. `"--extra-args='-Dlog_level.jmeter=DEBUG'"`).

### `j5 inspect <script>`
Parses your test script and displays the complete test plan structure (Setup, Scenarios, Teardown, Thresholds, and Backends) directly in the console for instant inspection.

---

## 📚 API Reference

### Http Samplers (`httpSampler`)
Configure HTTP requests using method builders: `get`, `post`, `put`, `patch`, and `delete`.

#### Extraction Methods (Chainable)
Extract values from responses and store them in JMeter variables:
*   `.jsonExtract(varName, jsonPath, matchNo?)`: JSONPath extraction.
*   `.regexExtract(varName, regex, matchNo?, default?)`: Regular Expression extraction.
*   `.xpathExtract(varName, xpath)`: XPath extraction.
*   `.boundaryExtract(varName, leftBoundary, rightBoundary)`: Left-and-right boundary extraction.

#### Assertion Methods (Chainable)
Verify response correctness:
*   `.assertStatus(code)`: Assert HTTP status matches the code.
*   `.assertBodyContains(text)`: Assert body contains a specific string.
*   `.assertBodyNotContains(text)`: Assert body does not contain a string.
*   `.assertResponseTime(maxMs)`: Assert execution time is within a millisecond threshold.

### Think Times / Timers
*   `sleep(duration)`: Fixed duration pause (e.g., `"2s"` or `"500ms"`).
*   `randomSleep(delay, range)`: Pause with uniform random variance.
*   `gaussianSleep(delay, range)`: Pause using a Gaussian distribution.

### CSV Data Sets (`csvDataSet`)
Parameterize requests using external CSV files.
```typescript
const users = csvDataSet("./data/users.csv", {
  variableNames: ["username", "password"],
  recycle: true,
  shareMode: "all",
});
registerCsv(users);

// Reference columns dynamically in samplers:
users.var("username"); // -> "${username}" at runtime
```

---

## 📝 License

Distributed under the MIT License. See [LICENSE](LICENSE) for more information.
