import type { XMLBuilder } from "xmlbuilder2/lib/interfaces.js";
import type {
  ExtractorDefinition,
  AssertionDefinition,
  HttpRequestConfig,
  BackendListenerConfig,
} from "../types/index.js";

export function parseDurationToSeconds(duration: string): number {
  const match = /^([\d.]+)(ms|s|m|h)$/.exec(duration);
  if (!match) return 0;
  const value = parseFloat(match[1] as string);
  switch (match[2]) {
    case "ms": return Math.ceil(value / 1000);
    case "s":  return Math.ceil(value);
    case "m":  return Math.ceil(value * 60);
    case "h":  return Math.ceil(value * 3600);
    default:   return 0;
  }
}

export function parseDurationToMs(duration: string): number {
  const match = /^([\d.]+)(ms|s|m|h)$/.exec(duration);
  if (!match) return 0;
  const value = parseFloat(match[1] as string);
  switch (match[2]) {
    case "ms": return Math.round(value);
    case "s":  return Math.round(value * 1000);
    case "m":  return Math.round(value * 60 * 1000);
    case "h":  return Math.round(value * 3600 * 1000);
    default:   return 0;
  }
}

export function parseBaseUrl(url: string): { protocol: string; host: string; port: string } {
  try {
    const u = new URL(url);
    const defaultPort = u.protocol === "https:" ? "443" : "80";
    return {
      protocol: u.protocol.replace(":", ""),
      host: u.hostname,
      port: u.port || defaultPort,
    };
  } catch {
    return { protocol: "http", host: url, port: "80" };
  }
}

export function resolveBody(body: HttpRequestConfig["body"]): string {
  if (!body) return "";
  if (typeof body === "string") return body;
  return JSON.stringify(body);
}

export function inferContentType(body: HttpRequestConfig["body"]): string | null {
  if (!body) return null;
  if (typeof body === "object") return "application/json";
  return "application/x-www-form-urlencoded";
}

export function addExtractor(parent: XMLBuilder, ext: ExtractorDefinition): void {
  switch (ext.type) {
    case "json":
      parent
        .ele("JSONPathExtractor", {
          guiclass: "JSONPathExtractorGui",
          testclass: "JSONPathExtractor",
          testname: `Extract ${ext.varName}`,
          enabled: "true",
        })
        .ele("stringProp", { name: "JSONPathExtractor.referenceName" }).txt(ext.varName).up()
        .ele("stringProp", { name: "JSONPathExtractor.jsonPathExpr" }).txt(ext.expression).up()
        .ele("stringProp", { name: "JSONPathExtractor.match_no" })
          .txt(String(ext.matchNo ?? 0)).up()
        .ele("stringProp", { name: "JSONPathExtractor.defaultValue" })
          .txt(ext.defaultValue ?? "NOT_FOUND").up();
      break;

    case "regex":
      parent
        .ele("RegexExtractor", {
          guiclass: "RegexExtractorGui",
          testclass: "RegexExtractor",
          testname: `Extract ${ext.varName}`,
          enabled: "true",
        })
        .ele("stringProp", { name: "RegexExtractor.referenceName" }).txt(ext.varName).up()
        .ele("stringProp", { name: "RegexExtractor.regex" }).txt(ext.expression).up()
        .ele("stringProp", { name: "RegexExtractor.template" }).txt("$1$").up()
        .ele("stringProp", { name: "RegexExtractor.match_no" })
          .txt(String(ext.matchNo ?? 1)).up()
        .ele("stringProp", { name: "RegexExtractor.default" })
          .txt(ext.defaultValue ?? "NOT_FOUND").up();
      break;

    case "xpath":
      parent
        .ele("XPathExtractor", {
          guiclass: "XPathExtractorGui",
          testclass: "XPathExtractor",
          testname: `Extract ${ext.varName}`,
          enabled: "true",
        })
        .ele("stringProp", { name: "XPathExtractor.refname" }).txt(ext.varName).up()
        .ele("stringProp", { name: "XPathExtractor.xpathQuery" }).txt(ext.expression).up()
        .ele("stringProp", { name: "XPathExtractor.default" })
          .txt(ext.defaultValue ?? "NOT_FOUND").up();
      break;

    case "boundary": {
      const parts = ext.expression.split("||");
      const left = parts[0] ?? "";
      const right = parts[1] ?? "";
      parent
        .ele("BoundaryExtractor", {
          guiclass: "BoundaryExtractorGui",
          testclass: "BoundaryExtractor",
          testname: `Extract ${ext.varName}`,
          enabled: "true",
        })
        .ele("stringProp", { name: "BoundaryExtractor.referenceName" }).txt(ext.varName).up()
        .ele("stringProp", { name: "BoundaryExtractor.lboundary" }).txt(left).up()
        .ele("stringProp", { name: "BoundaryExtractor.rboundary" }).txt(right).up()
        .ele("stringProp", { name: "BoundaryExtractor.match_no" })
          .txt(String(ext.matchNo ?? 1)).up()
        .ele("stringProp", { name: "BoundaryExtractor.default" })
          .txt(ext.defaultValue ?? "NOT_FOUND").up();
      break;
    }
  }
}

export function addAssertion(parent: XMLBuilder, assertion: AssertionDefinition): void {
  switch (assertion.type) {
    case "status":
      parent
        .ele("ResponseAssertion", {
          guiclass: "AssertionGui",
          testclass: "ResponseAssertion",
          testname: `Assert status ${assertion.value}`,
          enabled: "true",
        })
        .ele("collectionProp", { name: "Asserion.test_strings" })
          .ele("stringProp", { name: "49586" }).txt(String(assertion.value)).up()
        .up()
        .ele("stringProp", { name: "Assertion.test_field" }).txt("Assertion.response_code").up()
        .ele("boolProp", { name: "Assertion.assume_success" }).txt("false").up()
        .ele("intProp", { name: "Assertion.test_type" }).txt("8").up();
      break;

    case "body_contains":
      parent
        .ele("ResponseAssertion", {
          guiclass: "AssertionGui",
          testclass: "ResponseAssertion",
          testname: `Assert body contains "${assertion.value}"`,
          enabled: "true",
        })
        .ele("collectionProp", { name: "Asserion.test_strings" })
          .ele("stringProp", { name: "49586" }).txt(String(assertion.value)).up()
        .up()
        .ele("stringProp", { name: "Assertion.test_field" }).txt("Assertion.response_data").up()
        .ele("boolProp", { name: "Assertion.assume_success" }).txt("false").up()
        .ele("intProp", { name: "Assertion.test_type" }).txt("2").up();
      break;

    case "body_not_contains":
      parent
        .ele("ResponseAssertion", {
          guiclass: "AssertionGui",
          testclass: "ResponseAssertion",
          testname: `Assert body not contains "${assertion.value}"`,
          enabled: "true",
        })
        .ele("collectionProp", { name: "Asserion.test_strings" })
          .ele("stringProp", { name: "49586" }).txt(String(assertion.value)).up()
        .up()
        .ele("stringProp", { name: "Assertion.test_field" }).txt("Assertion.response_data").up()
        .ele("boolProp", { name: "Assertion.assume_success" }).txt("false").up()
        .ele("intProp", { name: "Assertion.test_type" }).txt("6").up();
      break;

    case "response_time":
      parent
        .ele("DurationAssertion", {
          guiclass: "DurationAssertionGui",
          testclass: "DurationAssertion",
          testname: `Assert response time < ${assertion.value}ms`,
          enabled: "true",
        })
        .ele("stringProp", { name: "DurationAssertion.duration" })
          .txt(String(assertion.value)).up();
      break;
  }
}

export function addBackendListener(parent: XMLBuilder, backend: BackendListenerConfig): void {
  const { type, server, parameters = {} } = backend;

  let classname = "";
  let defaultArgs: Record<string, string> = {};

  if (type === "influxdb") {
    classname = "org.apache.jmeter.visualizers.backend.influxdb.InfluxdbBackendListenerClient";
    defaultArgs = {
      influxdbMetricsSender: "org.apache.jmeter.visualizers.backend.influxdb.HttpMetricsSender",
      influxdbUrl: server,
      application: "j5",
      measurement: "jmeter",
      summaryOnly: "true",
      samplersRegexp: ".*",
      percentiles: "90;95;99",
      testTitle: "j5 Test Run",
      eventTags: "",
    };
  } else if (type === "graphite") {
    classname = "org.apache.jmeter.visualizers.backend.graphite.GraphiteBackendListenerClient";
    const parts = server.split(":");
    const host = parts[0] || "localhost";
    const port = parts[1] || "2003";
    defaultArgs = {
      graphiteMetricsSender: "org.apache.jmeter.visualizers.backend.graphite.TextGraphiteMetricsSender",
      graphiteHost: host,
      graphitePort: port,
      rootMetricsPrefix: "jmeter.",
      summaryOnly: "true",
      samplersList: "",
      percentiles: "90;95;99",
    };
  }

  const mergedArgs = { ...defaultArgs, ...parameters };

  const listenerEl = parent.ele("BackendListener", {
    guiclass: "BackendListenerGui",
    testclass: "BackendListener",
    testname: `Backend Listener (${type})`,
    enabled: "true",
  });

  const argsEl = listenerEl.ele("elementProp", {
    name: "arguments",
    elementType: "Arguments",
    guiclass: "ArgumentsPanel",
    testclass: "Arguments",
    enabled: "true",
  });

  const collectionEl = argsEl.ele("collectionProp", { name: "Arguments.arguments" });

  for (const [k, v] of Object.entries(mergedArgs)) {
    collectionEl
      .ele("elementProp", { name: k, elementType: "Argument" })
      .ele("stringProp", { name: "Argument.name" }).txt(k).up()
      .ele("stringProp", { name: "Argument.value" }).txt(v).up()
      .ele("stringProp", { name: "Argument.metadata" }).txt("=").up();
  }

  listenerEl.ele("stringProp", { name: "classname" }).txt(classname).up();
}
