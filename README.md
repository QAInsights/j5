# jmeter-js

Write JMeter performance tests like k6 — in TypeScript, no GUI, no XML.

```typescript
import { httpSampler, csvDataSet, registerSampler, registerCsv } from "jmeter-js";
import type { TestOptions } from "jmeter-js";

export const options: TestOptions = {
  vus: 50,
  rampUp: "1m",
  duration: "5m",
};

export const baseUrl = "https://api.example.com";

const users = csvDataSet("./data/users.csv", { variableNames: ["username", "password"] });
registerCsv(users);

export default function () {
  registerSampler(
    httpSampler
      .post("Login", "/api/login", { body: { username: users.var("username"), password: users.var("password") } })
      .jsonExtract("token", "$.token")
      .assertStatus(200)
  );

  registerSampler(
    httpSampler
      .get("Dashboard", "/api/dashboard", { headers: { Authorization: "Bearer ${token}" } })
      .assertStatus(200)
      .assertResponseTime(2000)
  );
}
```

## How it works

```
your-script.ts  →  jmeter-js run  →  plan.jmx  →  jmeter -n -t plan.jmx  →  results.jtl
```

1. Your TypeScript script is loaded and executed by the jmeter-js runtime.
2. DSL calls (`httpSampler`, `csvDataSet`) build an in-memory test plan.
3. The plan is serialized to a valid JMeter JMX file.
4. JMeter runs headlessly against the JMX.

No GUI. No XML. Full JMeter engine underneath.

---

## Install

```bash
npm install -g jmeter-js
# or locally
npm install --save-dev jmeter-js
```

**Prerequisites:** Apache JMeter 5.6+ installed. Set `JMETER_HOME` or add `jmeter` to your PATH.

---

## CLI

```bash
# Compile and run
jmeter-js run my-test.ts

# Generate JMX only (no execution)
jmeter-js run my-test.ts --dry-run

# Custom output paths
jmeter-js run my-test.ts --out ./plans/my-test.jmx --jtl ./results/my-test.jtl

# Specify JMeter binary explicitly
jmeter-js run my-test.ts --jmeter-bin /opt/jmeter/bin/jmeter

# Inspect parsed plan without generating JMX
jmeter-js inspect my-test.ts
```

### Flags

| Flag | Description | Default |
|---|---|---|
| `--dry-run` | Generate JMX only, skip JMeter execution | `false` |
| `--out <path>` | Output path for the JMX file | `<script>.jmx` |
| `--jtl <path>` | Output path for JTL results | `<script>.jtl` |
| `--jmeter-bin <path>` | Path to JMeter binary | `JMETER_HOME/bin/jmeter` |
| `--extra-args <args>` | Extra args passed to JMeter CLI (quoted) | `""` |

---

## Script structure

Every script must export three things:

```typescript
// 1. Load options
export const options: TestOptions = {
  vus: 50,           // number of virtual users (threads)
  rampUp: "1m",      // ramp-up period (optional, default 0s)
  duration: "5m",    // test duration
  // iterations: 10  // alternative to duration
};

// 2. Base URL — applied to all samplers via HTTP Request Defaults
export const baseUrl = "https://api.example.com";

// 3. Default function — registers samplers
export default function () {
  registerSampler(httpSampler.get("My Request", "/api/endpoint"));
}
```

---

## API Reference

### httpSampler

```typescript
httpSampler.get(name, path, config?)
httpSampler.post(name, path, config?)
httpSampler.put(name, path, config?)
httpSampler.patch(name, path, config?)
httpSampler.delete(name, path, config?)
```

**Config options:**

```typescript
{
  headers?: Record<string, string>;
  body?: string | Record<string, unknown>;  // objects are JSON-serialized
  contentType?: string;                      // inferred from body type if omitted
  followRedirects?: boolean;                 // default: true
  connectTimeout?: number;                   // ms
  responseTimeout?: number;                  // ms
}
```

**Extractors (chainable):**

```typescript
.jsonExtract(varName, jsonPath, matchNo?)        // JSONPath extractor
.regexExtract(varName, regex, matchNo?, default?) // Regex extractor
.xpathExtract(varName, xpath)                     // XPath extractor
.boundaryExtract(varName, leftBound, rightBound)  // Boundary extractor
```

**Assertions (chainable):**

```typescript
.assertStatus(code)               // HTTP status code assertion
.assertBodyContains(text)         // Response body contains text
.assertBodyNotContains(text)      // Response body does not contain text
.assertResponseTime(maxMs)        // Duration assertion in milliseconds
```

### csvDataSet

```typescript
const users = csvDataSet("./data/users.csv", {
  variableNames?: string[];   // column names (inferred from header row if omitted)
  delimiter?: string;         // default: ","
  recycle?: boolean;          // default: true
  stopThread?: boolean;       // stop thread on EOF, default: false
  shareMode?: "all" | "group" | "thread";  // default: "all"
});

// Reference variables in headers/body/path:
users.var("username")  // returns "${username}" — resolved by JMeter at runtime
```

### registerSampler / registerCsv

```typescript
import { registerSampler, registerCsv } from "jmeter-js";

registerCsv(users);          // must be called at module level or in default fn
registerSampler(builder);    // registers an httpSampler builder into the plan
```

---

## Duration format

Durations follow the pattern `<number><unit>`:

| Unit | Example |
|---|---|
| `ms` | `500ms` |
| `s` | `30s` |
| `m` | `5m` |
| `h` | `2h` |

---

## Environment variables

| Variable | Description |
|---|---|
| `JMETER_HOME` | Path to JMeter installation directory |

---

## What gets generated

For each script, jmeter-js generates a JMX with:

- **Test Plan** with user-defined variables
- **HTTP Request Defaults** (base URL, protocol, host, port)
- **CSV Data Set Config** elements for each `csvDataSet()` call
- **Thread Group** with scheduler (duration-based)
- **HTTPSamplerProxy** for each registered sampler
- **HeaderManager** per sampler (merged Content-Type + custom headers)
- **Extractor** elements (JSON / Regex / XPath / Boundary) per sampler
- **Assertion** elements (ResponseAssertion / DurationAssertion) per sampler
- **Summary Report** listener writing to `results.jtl`

---

## Roadmap

- [ ] Think time / pacing (`sleep`, `thinkTime`)
- [ ] Multiple thread groups per script
- [ ] Gaussian random timer support
- [ ] `setup` / `teardown` lifecycle hooks
- [ ] InfluxDB / Prometheus backend listener
- [ ] `jmeter-js convert` — JMX to jmeter-js script (reverse mode)
- [ ] Plugin support (Feather Wand, etc.)

---

## License

MIT
