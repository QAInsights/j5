import type {
  HttpRequestConfig,
  ExtractorDefinition,
  AssertionDefinition,
  SamplerNode,
} from "../types/index.js";

// ─── HttpSamplerBuilder ───────────────────────────────────────────────────────
// Fluent builder that accumulates config, extractors, and assertions.
// Call .build() to get the serializable SamplerNode.

export class HttpSamplerBuilder {
  private readonly _name: string;
  private readonly _method: SamplerNode["method"];
  private readonly _path: string;
  private readonly _config: HttpRequestConfig;
  private readonly _extractors: ExtractorDefinition[] = [];
  private readonly _assertions: AssertionDefinition[] = [];

  constructor(
    name: string,
    method: SamplerNode["method"],
    path: string,
    config: HttpRequestConfig = {}
  ) {
    this._name = name;
    this._method = method;
    this._path = path;
    this._config = config;
  }

  // ── Extractors ──────────────────────────────────────────────────────────────

  jsonExtract(varName: string, expression: string, matchNo = 0): this {
    this._extractors.push({ type: "json", varName, expression, matchNo });
    return this;
  }

  regexExtract(
    varName: string,
    expression: string,
    matchNo = 1,
    defaultValue = "NOT_FOUND"
  ): this {
    this._extractors.push({
      type: "regex",
      varName,
      expression,
      matchNo,
      defaultValue,
    });
    return this;
  }

  xpathExtract(varName: string, expression: string): this {
    this._extractors.push({ type: "xpath", varName, expression });
    return this;
  }

  boundaryExtract(
    varName: string,
    leftBoundary: string,
    rightBoundary: string
  ): this {
    // Store as "left||right", serializer splits on "||"
    this._extractors.push({
      type: "boundary",
      varName,
      expression: `${leftBoundary}||${rightBoundary}`,
    });
    return this;
  }

  // ── Assertions ──────────────────────────────────────────────────────────────

  assertStatus(code: number): this {
    this._assertions.push({ type: "status", value: code });
    return this;
  }

  assertBodyContains(text: string): this {
    this._assertions.push({ type: "body_contains", value: text });
    return this;
  }

  assertBodyNotContains(text: string): this {
    this._assertions.push({ type: "body_not_contains", value: text });
    return this;
  }

  assertResponseTime(maxMs: number): this {
    this._assertions.push({ type: "response_time", value: maxMs });
    return this;
  }

  // ── Build ────────────────────────────────────────────────────────────────────

  build(): SamplerNode {
    return {
      type: "sampler",
      name: this._name,
      method: this._method,
      path: this._path,
      config: this._config,
      extractors: [...this._extractors],
      assertions: [...this._assertions],
    };
  }
}

// ─── httpSampler factory ──────────────────────────────────────────────────────
// Usage:
//   httpSampler.get("/api/users", { headers: { Authorization: "Bearer ${token}" } })
//   httpSampler.post("/api/login", { body: { user: "${user}", pass: "${pass}" } })

function makeSampler(
  method: SamplerNode["method"],
  name: string,
  path: string,
  config: HttpRequestConfig = {}
): HttpSamplerBuilder {
  return new HttpSamplerBuilder(name, method, path, config);
}

export const httpSampler = {
  get: (name: string, path: string, config?: HttpRequestConfig) =>
    makeSampler("GET", name, path, config),

  post: (name: string, path: string, config?: HttpRequestConfig) =>
    makeSampler("POST", name, path, config),

  put: (name: string, path: string, config?: HttpRequestConfig) =>
    makeSampler("PUT", name, path, config),

  patch: (name: string, path: string, config?: HttpRequestConfig) =>
    makeSampler("PATCH", name, path, config),

  delete: (name: string, path: string, config?: HttpRequestConfig) =>
    makeSampler("DELETE", name, path, config),
} as const;
