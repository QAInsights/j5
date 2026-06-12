import { spawn } from "child_process";
import * as fs from "fs";
import * as path from "path";

export interface RunOptions {
  jmxPath: string;
  jtlPath?: string;
  logPath?: string;
  jmeterBin?: string;
  extraArgs?: string[];
}

export interface RunResult {
  exitCode: number;
  jtlPath: string;
}

// ─── JMeterRunner ─────────────────────────────────────────────────────────────
// Shells out to the JMeter binary in non-GUI mode (-n).
// Streams stdout/stderr to console in real-time.

export class JMeterRunner {
  private readonly _jmeterBin: string;

  constructor(jmeterBin?: string) {
    this._jmeterBin = jmeterBin ?? resolveJMeterBin();
  }

  async run(opts: RunOptions): Promise<RunResult> {
    const jtlPath = opts.jtlPath ?? opts.jmxPath.replace(".jmx", ".jtl");
    const logPath = opts.logPath ?? opts.jmxPath.replace(".jmx", ".log");

    const args = [
      "-n",                    // non-GUI mode
      "-t", opts.jmxPath,      // test plan
      "-l", jtlPath,           // results file
      "-j", logPath,           // JMeter log
      ...(opts.extraArgs ?? []),
    ];

    return new Promise((resolve, reject) => {
      console.log(`\n  Running: ${this._jmeterBin} ${args.join(" ")}\n`);

      const proc = spawn(this._jmeterBin, args, {
        stdio: ["ignore", "pipe", "pipe"],
        shell: process.platform === "win32",
      });

      proc.stdout.on("data", (chunk: Buffer) => {
        process.stdout.write(chunk);
      });

      proc.stderr.on("data", (chunk: Buffer) => {
        process.stderr.write(chunk);
      });

      proc.on("error", (err) => {
        reject(
          new Error(
            `Failed to start JMeter: ${err.message}\n` +
            `Make sure JMeter is installed and JMETER_HOME is set, or pass --jmeter-bin.`
          )
        );
      });

      proc.on("close", (code) => {
        resolve({ exitCode: code ?? 1, jtlPath });
      });
    });
  }

  isAvailable(): boolean {
    try {
      const { execSync } = require("child_process") as typeof import("child_process");
      execSync(`"${this._jmeterBin}" --version 2>&1`, { stdio: "ignore" });
      return true;
    } catch {
      return false;
    }
  }
}

// ─── Resolve JMeter binary ────────────────────────────────────────────────────

function resolveJMeterBin(): string {
  // 1. JMETER_HOME env var
  const jmeterHome = process.env["JMETER_HOME"];
  if (jmeterHome) {
    const bin = path.join(jmeterHome, "bin", isWindows() ? "jmeter.bat" : "jmeter");
    if (fs.existsSync(bin)) return bin;
  }

  // 2. PATH, just call "jmeter" directly
  return isWindows() ? "jmeter.bat" : "jmeter";
}

function isWindows(): boolean {
  return process.platform === "win32";
}
