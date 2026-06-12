import * as path from "path";
import * as fs from "fs";
import { TestPlan } from "../plan/TestPlan.js";
import { JmxSerializer } from "../plan/JmxSerializer.js";
import type { TestOptions } from "../types/index.js";
import type { HttpSamplerBuilder } from "../dsl/httpSampler.js";
import type { CsvNode } from "../types/index.js";

export interface ScriptModule {
  options: TestOptions;
  baseUrl: string;
  default: () => void | HttpSamplerBuilder | HttpSamplerBuilder[];
  setup?: () => void;
  teardown?: () => void;
}

// ─── loadScript ───────────────────────────────────────────────────────────────

export async function loadScript(scriptPath: string): Promise<ScriptModule> {
  const resolved = path.resolve(scriptPath);

  if (!fs.existsSync(resolved)) {
    throw new Error(`Script not found: ${resolved}`);
  }

  TestPlan.reset();

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require("ts-node").register({
      compilerOptions: {
        module: "commonjs",
        resolveJsonModule: true,
        esModuleInterop: true,
      },
      transpileOnly: true,
      preferTsExts: true,
    });

    // Intercept require resolver to map src/ files to dist/ files so that
    // the CLI and the user script share the same singleton instance.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Module = require("module");
    const originalResolveFilename = Module._resolveFilename;
    Module._resolveFilename = function (
      request: string,
      parent: any,
      isMain: boolean,
      options: any
    ) {
      let resolved: string;
      try {
        resolved = originalResolveFilename.call(this, request, parent, isMain, options);
      } catch (err) {
        if (request.endsWith(".js")) {
          const tsRequest = request.slice(0, -3) + ".ts";
          resolved = originalResolveFilename.call(this, tsRequest, parent, isMain, options);
        } else {
          throw err;
        }
      }
      const srcPattern = path.sep + "src" + path.sep;
      const distPattern = path.sep + "dist" + path.sep;
      if (resolved.includes(srcPattern)) {
        const redirected = resolved
          .replace(srcPattern, distPattern)
          .replace(/\.ts$/, ".js");
        if (fs.existsSync(redirected)) {
          return redirected;
        }
      }
      return resolved;
    };
  } catch (err) {
    // ignore
  }

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require(resolved) as ScriptModule;

  if (!mod.options) {
    throw new Error("Script must export: export const options = { vus, duration }");
  }
  if (!mod.baseUrl) {
    throw new Error("Script must export: export const baseUrl = 'https://...'");
  }
  const hasScenarios = mod.options?.scenarios && Object.keys(mod.options.scenarios).length > 0;
  if (!hasScenarios && typeof mod.default !== "function") {
    throw new Error("Script must export a default function");
  }

  const plan = TestPlan.getInstance();
  plan.setOptions(mod.options);
  plan.setBaseUrl(mod.baseUrl);

  // 1. Run setup scope
  if (typeof mod.setup === "function") {
    plan.setScope("setup");
    try {
      mod.setup();
    } catch (err) {
      // Non-fatal, just log or ignore
    }
  }

  // 2. Run scenarios or main scope
  if (mod.options.scenarios) {
    for (const [scenarioName, scenarioConfig] of Object.entries(mod.options.scenarios)) {
      const execName = scenarioConfig.exec;
      const fn = (mod as any)[execName];
      if (typeof fn === "function") {
        plan.setScope("scenario_" + scenarioName);
        try {
          fn();
        } catch (err) {
          // Non-fatal
        }
      } else {
        throw new Error(
          `Scenario '${scenarioName}' specifies exec function '${execName}', which is not exported from the script.`
        );
      }
    }
  } else {
    plan.setScope("main");
    try {
      mod.default();
    } catch (_err) {
      // Non-fatal
    }
  }

  // 3. Run teardown scope
  if (typeof mod.teardown === "function") {
    plan.setScope("teardown");
    try {
      mod.teardown();
    } catch (err) {
      // Non-fatal
    }
  }

  // Restore main scope
  plan.setScope("main");

  return mod;
}

// ─── generateJmx ─────────────────────────────────────────────────────────────

export function generateJmx(outputPath: string): string {
  const plan = TestPlan.getInstance();
  const model = plan.toModel();
  const serializer = new JmxSerializer();
  const xml = serializer.serialize(model);
  fs.writeFileSync(outputPath, xml, "utf-8");
  return xml;
}

// ─── Registration helpers ─────────────────────────────────────────────────────

export function registerSampler(builder: HttpSamplerBuilder): void {
  TestPlan.getInstance().addSampler(builder);
}

export function registerCsv(node: CsvNode): void {
  TestPlan.getInstance().addCsv(node);
}
