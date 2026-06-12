import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import { httpSampler } from "../src/dsl/httpSampler.js";
import { csvDataSet } from "../src/dsl/csvDataSet.js";
import { TestPlan } from "../src/plan/TestPlan.js";
import { JmxSerializer } from "../src/plan/JmxSerializer.js";
import { sleep, randomSleep, gaussianSleep, group } from "../src/index.js";
import { parseDurationToSeconds, parseBaseUrl, parseDurationToMs } from "../src/plan/JmxSerializerHelpers.js";

describe("J5 Base Library", () => {
  beforeEach(() => {
    TestPlan.reset();
  });

  describe("Duration and URL Parsers", () => {
    it("should parse duration strings to seconds", () => {
      expect(parseDurationToSeconds("500ms")).toBe(1);
      expect(parseDurationToSeconds("30s")).toBe(30);
      expect(parseDurationToSeconds("5m")).toBe(300);
      expect(parseDurationToSeconds("2h")).toBe(7200);
      expect(parseDurationToSeconds("invalid")).toBe(0);
    });

    it("should parse duration strings to milliseconds", () => {
      expect(parseDurationToMs("500ms")).toBe(500);
      expect(parseDurationToMs("30s")).toBe(30000);
      expect(parseDurationToMs("5m")).toBe(300000);
      expect(parseDurationToMs("invalid")).toBe(0);
    });

    it("should parse base URLs", () => {
      expect(parseBaseUrl("https://example.com")).toEqual({
        protocol: "https",
        host: "example.com",
        port: "443",
      });
      expect(parseBaseUrl("http://localhost:8080")).toEqual({
        protocol: "http",
        host: "localhost",
        port: "8080",
      });
      expect(parseBaseUrl("example.com")).toEqual({
        protocol: "http",
        host: "example.com",
        port: "80",
      });
    });
  });

  describe("httpSampler", () => {
    it("should build simple sampler nodes", () => {
      const getSampler = httpSampler.get("Get Products", "/products", {
        headers: { Authorization: "Bearer xyz" },
      }).build();

      expect(getSampler.type).toBe("sampler");
      expect(getSampler.name).toBe("Get Products");
      expect(getSampler.method).toBe("GET");
      expect(getSampler.path).toBe("/products");
      expect(getSampler.config.headers?.Authorization).toBe("Bearer xyz");
    });

    it("should build sampler with extractors and assertions", () => {
      const sampler = httpSampler.post("Create User", "/users", {
        body: { name: "John" },
      })
        .jsonExtract("userId", "$.id")
        .regexExtract("userToken", "token=(.*)")
        .xpathExtract("xmlField", "//field")
        .boundaryExtract("boundVar", "L", "R")
        .assertStatus(201)
        .assertBodyContains("success")
        .assertBodyNotContains("error")
        .assertResponseTime(1000)
        .build();

      expect(sampler.extractors).toHaveLength(4);
      expect(sampler.extractors[0]).toEqual({ type: "json", varName: "userId", expression: "$.id", matchNo: 0 });
      expect(sampler.extractors[1]).toEqual({ type: "regex", varName: "userToken", expression: "token=(.*)", matchNo: 1, defaultValue: "NOT_FOUND" });
      expect(sampler.extractors[2]).toEqual({ type: "xpath", varName: "xmlField", expression: "//field" });
      expect(sampler.extractors[3]).toEqual({ type: "boundary", varName: "boundVar", expression: "L||R" });

      expect(sampler.assertions).toHaveLength(4);
      expect(sampler.assertions[0]).toEqual({ type: "status", value: 201 });
      expect(sampler.assertions[1]).toEqual({ type: "body_contains", value: "success" });
      expect(sampler.assertions[2]).toEqual({ type: "body_not_contains", value: "error" });
      expect(sampler.assertions[3]).toEqual({ type: "response_time", value: 1000 });
    });
  });

  describe("csvDataSet", () => {
    it("should configure CSV data sets", () => {
      const csv = csvDataSet("./data.csv", {
        variableNames: ["id", "username"],
        delimiter: ";",
        recycle: false,
      });

      expect(csv.type).toBe("csv");
      expect(csv.config.filename).toBe("./data.csv");
      expect(csv.config.variableNames).toEqual(["id", "username"]);
      expect(csv.config.delimiter).toBe(";");
      expect(csv.config.recycle).toBe(false);
      expect(csv.var("username")).toBe("${username}");
    });
  });

  describe("JmxSerializer", () => {
    it("should serialize a basic test plan into JMX XML", () => {
      const plan = TestPlan.getInstance();
      plan.setOptions({ vus: 10, duration: "1m" });
      plan.setBaseUrl("https://api.example.com");

      const sampler = httpSampler.get("Get Home", "/");
      plan.addSampler(sampler);

      const serializer = new JmxSerializer();
      const xml = serializer.serialize(plan.toModel());

      expect(xml).toContain("<jmeterTestPlan");
      expect(xml).toContain("testname=\"j5 Test Plan\"");
      expect(xml).toContain("<stringProp name=\"HTTPSampler.domain\">api.example.com</stringProp>");
      expect(xml).toContain("<intProp name=\"ThreadGroup.num_threads\">10</intProp>");
      expect(xml).toContain("testname=\"Get Home\"");
    });

    it("should serialize timers in order", () => {
      const plan = TestPlan.getInstance();
      plan.setOptions({ vus: 1, duration: "10s" });
      plan.setBaseUrl("https://api.example.com");

      plan.addSampler(httpSampler.get("Get 1", "/1"));
      sleep("1.5s");
      plan.addSampler(httpSampler.get("Get 2", "/2"));
      randomSleep("100ms", "500ms");
      gaussianSleep("2s", "200ms");

      const serializer = new JmxSerializer();
      const xml = serializer.serialize(plan.toModel());

      expect(xml).toContain("testname=\"Get 1\"");
      expect(xml).toContain("testname=\"Get 2\"");
      expect(xml).toContain("<ConstantTimer");
      expect(xml).toContain("<stringProp name=\"ConstantTimer.delay\">1500</stringProp>");
      expect(xml).toContain("<UniformRandomTimer");
      expect(xml).toContain("<stringProp name=\"RandomTimer.range\">400</stringProp>");
      expect(xml).toContain("<GaussianRandomTimer");
      expect(xml).toContain("<stringProp name=\"RandomTimer.range\">200</stringProp>");
    });

    it("should serialize setup and teardown thread groups", () => {
      const plan = TestPlan.getInstance();
      plan.setOptions({ vus: 5, duration: "30s" });
      plan.setBaseUrl("https://api.example.com");

      plan.setScope("setup");
      plan.addSampler(httpSampler.post("Setup User", "/users"));

      plan.setScope("main");
      plan.addSampler(httpSampler.get("Get Products", "/products"));

      plan.setScope("teardown");
      plan.addSampler(httpSampler.delete("Teardown User", "/users/1"));

      const serializer = new JmxSerializer();
      const xml = serializer.serialize(plan.toModel());

      expect(xml).toContain("<SetupThreadGroup");
      expect(xml).toContain("testname=\"Setup User\"");
      expect(xml).toContain("<ThreadGroup guiclass=\"ThreadGroupGui\"");
      expect(xml).toContain("testname=\"Get Products\"");
      expect(xml).toContain("<PostThreadGroup");
      expect(xml).toContain("testname=\"Teardown User\"");
    });

    it("should serialize nested groups and transaction controllers", () => {
      const plan = TestPlan.getInstance();
      plan.setOptions({ vus: 1, duration: "10s" });
      plan.setBaseUrl("https://api.example.com");

      group("Authentication", () => {
        plan.addSampler(httpSampler.post("Login", "/login"));
        sleep("500ms");
      });

      group("Shopping Cart", () => {
        plan.addSampler(httpSampler.get("View Cart", "/cart"));
        group("Checkout", () => {
          plan.addSampler(httpSampler.post("Pay", "/checkout"));
        });
      });

      const serializer = new JmxSerializer();
      const xml = serializer.serialize(plan.toModel());

      expect(xml).toContain("testname=\"Authentication\"");
      expect(xml).toContain("testname=\"Login\"");
      expect(xml).toContain("testname=\"Shopping Cart\"");
      expect(xml).toContain("testname=\"View Cart\"");
      expect(xml).toContain("testname=\"Checkout\"");
      expect(xml).toContain("testname=\"Pay\"");
    });

    it("should serialize multiple scenarios", () => {
      const plan = TestPlan.getInstance();
      plan.setOptions({
        scenarios: {
          searchScenario: {
            executor: "constant-vus",
            vus: 3,
            duration: "45s",
            exec: "runSearch",
          },
          purchaseScenario: {
            executor: "ramping-vus",
            vus: 8,
            rampUp: "15s",
            duration: "1m",
            exec: "runPurchase",
          },
        },
      });
      plan.setBaseUrl("https://api.example.com");

      plan.setScope("scenario_searchScenario");
      plan.addSampler(httpSampler.get("Search Items", "/search"));

      plan.setScope("scenario_purchaseScenario");
      plan.addSampler(httpSampler.post("Buy Item", "/buy"));

      const serializer = new JmxSerializer();
      const xml = serializer.serialize(plan.toModel());

      expect(xml).toContain("testname=\"Scenario - searchScenario (3 VUs)\"");
      expect(xml).toContain("testname=\"Search Items\"");
      expect(xml).toContain("<intProp name=\"ThreadGroup.num_threads\">3</intProp>");
      expect(xml).toContain("<stringProp name=\"ThreadGroup.duration\">45</stringProp>");

      expect(xml).toContain("testname=\"Scenario - purchaseScenario (8 VUs)\"");
      expect(xml).toContain("testname=\"Buy Item\"");
      expect(xml).toContain("<intProp name=\"ThreadGroup.num_threads\">8</intProp>");
      expect(xml).toContain("<intProp name=\"ThreadGroup.ramp_time\">15</intProp>");
      expect(xml).toContain("<stringProp name=\"ThreadGroup.duration\">60</stringProp>");
    });

    it("should serialize backend listeners", () => {
      const plan = TestPlan.getInstance();
      plan.setOptions({
        vus: 1,
        duration: "10s",
        backends: [
          {
            type: "influxdb",
            server: "http://localhost:8086/write?db=jmeter_test",
            parameters: {
              application: "my-custom-app",
              summaryOnly: "false",
            },
          },
          {
            type: "graphite",
            server: "graphite.example.com:2004",
            parameters: {
              rootMetricsPrefix: "custom.jmeter.",
            },
          },
        ],
      });
      plan.setBaseUrl("https://example.com");
      plan.addSampler(httpSampler.get("Ping", "/ping"));

      const serializer = new JmxSerializer();
      const xml = serializer.serialize(plan.toModel());

      // InfluxDB Listener checks
      expect(xml).toContain("<BackendListener guiclass=\"BackendListenerGui\" testclass=\"BackendListener\" testname=\"Backend Listener (influxdb)\" enabled=\"true\">");
      expect(xml).toContain("<stringProp name=\"classname\">org.apache.jmeter.visualizers.backend.influxdb.InfluxdbBackendListenerClient</stringProp>");
      expect(xml).toContain("name=\"influxdbUrl\"");
      expect(xml).toContain("<stringProp name=\"Argument.value\">http://localhost:8086/write?db=jmeter_test</stringProp>");
      expect(xml).toContain("<stringProp name=\"Argument.value\">my-custom-app</stringProp>");
      expect(xml).toContain("<stringProp name=\"Argument.value\">false</stringProp>");

      // Graphite Listener checks
      expect(xml).toContain("<BackendListener guiclass=\"BackendListenerGui\" testclass=\"BackendListener\" testname=\"Backend Listener (graphite)\" enabled=\"true\">");
      expect(xml).toContain("<stringProp name=\"classname\">org.apache.jmeter.visualizers.backend.graphite.GraphiteBackendListenerClient</stringProp>");
      expect(xml).toContain("name=\"graphiteHost\"");
      expect(xml).toContain("<stringProp name=\"Argument.value\">graphite.example.com</stringProp>");
      expect(xml).toContain("name=\"graphitePort\"");
      expect(xml).toContain("<stringProp name=\"Argument.value\">2004</stringProp>");
      expect(xml).toContain("<stringProp name=\"Argument.value\">custom.jmeter.</stringProp>");
    });
  });

  describe("ThresholdEvaluator", () => {
    const dummyJtlPath = "./test-temp-results.jtl";

    beforeEach(() => {
      if (fs.existsSync(dummyJtlPath)) {
        fs.unlinkSync(dummyJtlPath);
      }
    });

    afterEach(() => {
      if (fs.existsSync(dummyJtlPath)) {
        fs.unlinkSync(dummyJtlPath);
      }
    });

    it("should evaluate global thresholds correctly", () => {
      const jtlContent = [
        "1781230852280,100,Homepage,200,OK,Thread Group 1-1,true,873,https://example.com/,50",
        "1781230852280,200,Homepage,200,OK,Thread Group 1-1,true,873,https://example.com/,50",
        "1781230852280,300,Homepage,200,OK,Thread Group 1-1,true,873,https://example.com/,50",
        "1781230852280,400,Homepage,500,Internal Error,Thread Group 1-1,false,873,https://example.com/,50",
      ].join("\n");
      fs.writeFileSync(dummyJtlPath, jtlContent, "utf-8");

      const thresholds = {
        "http_req_duration": ["p(95)<500", "avg<300"],
        "http_req_failed": ["rate<=0.25"],
      };

      const { ThresholdEvaluator } = require("../src/runner/ThresholdEvaluator.ts");
      const result = ThresholdEvaluator.evaluate(dummyJtlPath, thresholds);
      expect(result.passed).toBe(true);
      expect(result.results).toHaveLength(3);

      const p95Res = result.results.find((r: any) => r.expression === "p(95)<500");
      expect(p95Res?.passed).toBe(true);
      expect(p95Res?.actualValue).toBe(400);
    });

    it("should fail when thresholds are breached", () => {
      const jtlContent = [
        "1781230852280,600,Homepage,200,OK,Thread Group 1-1,true,873,https://example.com/,50",
      ].join("\n");
      fs.writeFileSync(dummyJtlPath, jtlContent, "utf-8");

      const thresholds = {
        "http_req_duration": ["p(95)<500"],
        "http_req_failed": ["rate<0.01"],
      };

      const { ThresholdEvaluator } = require("../src/runner/ThresholdEvaluator.ts");
      const result = ThresholdEvaluator.evaluate(dummyJtlPath, thresholds);
      expect(result.passed).toBe(false);
      expect(result.results.find((r: any) => r.metric === "http_req_duration")?.passed).toBe(false);
    });

    it("should support filtered thresholds by label", () => {
      const jtlContent = [
        "1781230852280,100,Homepage,200,OK,Thread Group 1-1,true,873,https://example.com/,50",
        "1781230852280,900,Login,200,OK,Thread Group 1-1,true,873,https://example.com/,50",
      ].join("\n");
      fs.writeFileSync(dummyJtlPath, jtlContent, "utf-8");

      const thresholds = {
        "http_req_duration{label=Homepage}": ["avg<200"],
        "http_req_duration{label=Login}": ["avg<1000"],
      };

      const { ThresholdEvaluator } = require("../src/runner/ThresholdEvaluator.ts");
      const result = ThresholdEvaluator.evaluate(dummyJtlPath, thresholds);
      expect(result.passed).toBe(true);
    });
  });
});
