// ─── Core shared types ────────────────────────────────────────────────────────

export interface ScenarioConfig {
  executor: "constant-vus" | "ramping-vus";
  vus: number;
  rampUp?: string;       // e.g. "1m", "30s"
  duration?: string;      // e.g. "5m", "10m"
  iterations?: number;
  exec: string;          // Name of the function export to run
}

export interface BackendListenerConfig {
  type: "influxdb" | "graphite";
  server: string;
  parameters?: Record<string, string>;
}

export interface TestOptions {
  vus?: number;
  rampUp?: string;       // e.g. "1m", "30s"
  duration?: string;      // e.g. "5m", "10m"
  iterations?: number;   // alternative to duration
  scenarios?: Record<string, ScenarioConfig>;
  thresholds?: Record<string, string[]>;
  backends?: BackendListenerConfig[];
}

export interface HttpRequestConfig {
  headers?: Record<string, string>;
  body?: string | Record<string, unknown>;
  contentType?: string;
  followRedirects?: boolean;
  connectTimeout?: number;   // ms
  responseTimeout?: number;  // ms
}

export interface ExtractorDefinition {
  type: "json" | "regex" | "xpath" | "boundary";
  varName: string;
  expression: string;
  matchNo?: number;        // -1 = random, 0 = all, N = nth
  defaultValue?: string;
}

export interface AssertionDefinition {
  type: "status" | "body_contains" | "body_not_contains" | "response_time";
  value: string | number;
}

export interface CsvDataSetConfig {
  filename: string;
  variableNames?: string[];   // inferred from header row if omitted
  delimiter?: string;
  recycle?: boolean;
  stopThread?: boolean;
  shareMode?: "all" | "group" | "thread";
}

export interface ThreadGroupConfig {
  vus: number;
  rampUp: number;    // seconds
  duration: number;  // seconds
  iterations?: number;
}

// Internal plan node types used by JmxSerializer
export interface PlanNode {
  type: string;
}

export interface SamplerNode extends PlanNode {
  type: "sampler";
  name: string;
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  config: HttpRequestConfig;
  extractors: ExtractorDefinition[];
  assertions: AssertionDefinition[];
}

export interface TimerNode extends PlanNode {
  type: "timer";
  timerType: "constant" | "uniform" | "gaussian";
  delay: string;  // milliseconds as string
  range?: string; // milliseconds as string
}

export interface GroupNode extends PlanNode {
  type: "group";
  name: string;
  children: PlanElement[];
}

export type PlanElement = SamplerNode | TimerNode | GroupNode;

export interface CsvNode extends PlanNode {
  type: "csv";
  config: CsvDataSetConfig;
}

export interface ScenarioModel {
  name: string;
  config: ScenarioConfig;
  children: PlanElement[];
  samplers: SamplerNode[];
}

export interface TestPlanModel {
  options: TestOptions;
  baseUrl: string;
  csvNodes: CsvNode[];
  children: PlanElement[];
  samplers: SamplerNode[];
  setupChildren: PlanElement[];
  teardownChildren: PlanElement[];
  setupSamplers: SamplerNode[];
  teardownSamplers: SamplerNode[];
  scenarios: ScenarioModel[];
}

