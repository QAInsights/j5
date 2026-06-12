/**
 * login-flow.ts
 * Full login + dashboard flow with CSV parameterization.
 *
 * Run:
 *   jmeter-js run examples/login-flow.ts             # compile + execute
 *   jmeter-js run examples/login-flow.ts --dry-run   # JMX only
 *   jmeter-js inspect examples/login-flow.ts         # show plan structure
 */
import {
  httpSampler,
  csvDataSet,
  registerSampler,
  registerCsv,
  type TestOptions,
} from "../src/index.js";

// ── Options (mirrors k6 style) ────────────────────────────────────────────────

export const options: TestOptions = {
  vus: 50,
  rampUp: "1m",
  duration: "5m",
};

export const baseUrl = "https://api.example.com";

// ── Data ──────────────────────────────────────────────────────────────────────

const users = csvDataSet("./data/users.csv", {
  variableNames: ["username", "password"],
  recycle: true,
  shareMode: "all",
});

registerCsv(users);

// ── Scenario ──────────────────────────────────────────────────────────────────

export default function () {
  // Step 1: Login, extract token from JSON response
  const loginSampler = httpSampler
    .post("Login", "/api/login", {
      body: {
        username: users.var("username"),
        password: users.var("password"),
      },
      contentType: "application/json",
      responseTimeout: 5000,
    })
    .jsonExtract("authToken", "$.token")
    .assertStatus(200)
    .assertBodyContains("token");

  registerSampler(loginSampler);

  // Step 2: Dashboard, use extracted token in header
  const dashboardSampler = httpSampler
    .get("Dashboard", "/api/dashboard", {
      headers: {
        Authorization: "Bearer ${authToken}",
      },
    })
    .assertStatus(200)
    .assertResponseTime(2000);

  registerSampler(dashboardSampler);

  // Step 3: User profile
  const profileSampler = httpSampler
    .get("User Profile", "/api/profile/${username}", {
      headers: {
        Authorization: "Bearer ${authToken}",
        Accept: "application/json",
      },
    })
    .jsonExtract("userId", "$.id", 0)
    .assertStatus(200);

  registerSampler(profileSampler);
}
