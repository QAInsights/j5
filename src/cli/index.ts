#!/usr/bin/env node
import { Command } from "commander";
import * as path from "path";
import * as fs from "fs";
import chalk from "chalk";
import { loadScript, generateJmx } from "../runner/ScriptLoader.js";
import { JMeterRunner } from "../runner/JMeterRunner.js";

const pkg = JSON.parse(
  fs.readFileSync(path.join(__dirname, "../../package.json"), "utf-8")
) as { version: string; description: string };

const program = new Command();

program
  .name("j5")
  .description(pkg.description)
  .version(pkg.version);

// ─── run command ──────────────────────────────────────────────────────────────

program
  .command("run <script>")
  .description("Compile a j5 script to JMX and run it via JMeter")
  .option("--dry-run", "Generate JMX only, do not execute JMeter", false)
  .option("--out <path>", "Output path for the generated JMX file", "")
  .option("--jtl <path>", "Output path for the JTL results file", "")
  .option("--jmeter-bin <path>", "Path to JMeter binary (overrides JMETER_HOME)", "")
  .option("--extra-args <args>", "Extra JMeter CLI arguments (quoted string)", "")
  .action(async (script: string, opts: {
    dryRun: boolean;
    out: string;
    jtl: string;
    jmeterBin: string;
    extraArgs: string;
  }) => {
    console.log(chalk.cyan("\n  j5") + chalk.gray(` v${pkg.version}\n`));

    // ── 1. Load and parse the script ─────────────────────────────────────────
    console.log(chalk.gray(`  Loading script: ${script}`));
    try {
      await loadScript(script);
    } catch (err) {
      console.error(chalk.red(`\n  Script error: ${(err as Error).message}\n`));
      process.exit(1);
    }

    // ── 2. Generate JMX ──────────────────────────────────────────────────────
    const scriptBase = path.basename(script, path.extname(script));
    const jmxPath = opts.out || path.join(path.dirname(script), `${scriptBase}.jmx`);

    try {
      generateJmx(jmxPath);
      console.log(chalk.green(`  JMX generated: ${jmxPath}`));
    } catch (err) {
      console.error(chalk.red(`\n  JMX generation failed: ${(err as Error).message}\n`));
      process.exit(1);
    }

    // ── 3. Dry-run exit ──────────────────────────────────────────────────────
    if (opts.dryRun) {
      console.log(chalk.yellow("\n  --dry-run flag set. Skipping JMeter execution.\n"));
      console.log(chalk.gray(`  To run manually:\n`));
      console.log(chalk.white(`  jmeter -n -t ${jmxPath} -l results.jtl\n`));
      process.exit(0);
    }

    // ── 4. Run JMeter ────────────────────────────────────────────────────────
    const runner = new JMeterRunner(opts.jmeterBin || undefined);

    if (!runner.isAvailable()) {
      console.error(
        chalk.red("\n  JMeter binary not found.\n") +
        chalk.gray(
          "  Set JMETER_HOME, add jmeter to PATH, or pass --jmeter-bin <path>\n" +
          "  Use --dry-run to skip execution and only generate the JMX.\n"
        )
      );
      process.exit(1);
    }

    console.log(chalk.cyan("\n  Starting JMeter...\n"));

    try {
      const result = await runner.run({
        jmxPath,
        jtlPath: opts.jtl || undefined,
        jmeterBin: opts.jmeterBin || undefined,
        extraArgs: opts.extraArgs ? opts.extraArgs.split(" ") : [],
      });

      if (result.exitCode === 0) {
        console.log(chalk.green(`\n  Test completed. Results: ${result.jtlPath}\n`));

        // Evaluate thresholds if defined
        const { TestPlan } = await import("../plan/TestPlan.js");
        const model = TestPlan.getInstance().toModel();
        if (model.options.thresholds && Object.keys(model.options.thresholds).length > 0) {
          const { ThresholdEvaluator } = await import("../runner/ThresholdEvaluator.js");
          const evalRes = ThresholdEvaluator.evaluate(result.jtlPath, model.options.thresholds);
          if (!evalRes.passed) {
            console.error(chalk.red("  ✗ Some thresholds breached.\n"));
            process.exit(1);
          }
        }
      } else {
        console.error(chalk.red(`\n  JMeter exited with code ${result.exitCode}\n`));
        process.exit(result.exitCode);
      }
    } catch (err) {
      console.error(chalk.red(`\n  Runner error: ${(err as Error).message}\n`));
      process.exit(1);
    }
  });

// ─── inspect command ──────────────────────────────────────────────────────────

program
  .command("inspect <script>")
  .description("Show parsed test plan structure without generating JMX")
  .action(async (script: string) => {
    console.log(chalk.cyan("\n  j5 inspect\n"));

    try {
      await loadScript(script);
      const { TestPlan } = await import("../plan/TestPlan.js");
      const model = TestPlan.getInstance().toModel();

      console.log(chalk.white("  Options:"));
      console.log(chalk.gray(`    vus:      ${model.options.vus}`));
      console.log(chalk.gray(`    rampUp:   ${model.options.rampUp ?? "0s"}`));
      console.log(chalk.gray(`    duration: ${model.options.duration}`));
      console.log(chalk.white("\n  Base URL:"));
      console.log(chalk.gray(`    ${model.baseUrl}`));

      if (model.csvNodes.length > 0) {
        console.log(chalk.white("\n  CSV Data Sets:"));
        for (const csv of model.csvNodes) {
          console.log(chalk.gray(`    - ${csv.config.filename}`));
        }
      }

      const printSampler = (s: any) => {
        const extractors = s.extractors.length > 0
          ? chalk.gray(` [${s.extractors.map((e: any) => e.varName).join(", ")}]`)
          : "";
        const assertions = s.assertions.length > 0
          ? chalk.gray(` {${s.assertions.map((a: any) => a.type).join(", ")}}`)
          : "";
        console.log(
          chalk.gray(`    ${s.method.padEnd(6)} ${s.path}`) +
          extractors +
          assertions
        );
      };

      if (model.setupSamplers.length > 0) {
        console.log(chalk.white("\n  Setup Samplers:"));
        for (const s of model.setupSamplers) {
          printSampler(s);
        }
      }

      if (model.scenarios.length > 0) {
        for (const scenario of model.scenarios) {
          console.log(chalk.white(`\n  Scenario [${scenario.name}] Samplers:`));
          for (const s of scenario.samplers) {
            printSampler(s);
          }
        }
      } else if (model.samplers.length > 0) {
        console.log(chalk.white("\n  Samplers:"));
        for (const s of model.samplers) {
          printSampler(s);
        }
      }

      if (model.teardownSamplers.length > 0) {
        console.log(chalk.white("\n  Teardown Samplers:"));
        for (const s of model.teardownSamplers) {
          printSampler(s);
        }
      }

      if (model.options.thresholds && Object.keys(model.options.thresholds).length > 0) {
        console.log(chalk.white("\n  Thresholds:"));
        for (const [metric, exprs] of Object.entries(model.options.thresholds)) {
          console.log(chalk.gray(`    - ${metric}: ${exprs.join(", ")}`));
        }
      }

      if (model.options.backends && model.options.backends.length > 0) {
        console.log(chalk.white("\n  Backend Listeners:"));
        for (const backend of model.options.backends) {
          console.log(chalk.gray(`    - ${backend.type} @ ${backend.server}`));
        }
      }

      console.log();
    } catch (err) {
      console.error(chalk.red(`\n  Error: ${(err as Error).message}\n`));
      process.exit(1);
    }
  });

program.parse(process.argv);
