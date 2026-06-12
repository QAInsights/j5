import * as fs from "fs";
import chalk from "chalk";

export interface ThresholdResult {
  metric: string;
  expression: string;
  actualValue: number;
  thresholdValue: number;
  passed: boolean;
}

export interface MetricSummary {
  avg: number;
  med: number;
  min: number;
  max: number;
  p90: number;
  p95: number;
  p99: number;
  rate: number; // failure rate
  total: number;
  failed: number;
}

export class ThresholdEvaluator {
  static evaluate(jtlPath: string, thresholds: Record<string, string[]>): { passed: boolean; results: ThresholdResult[] } {
    if (!fs.existsSync(jtlPath)) {
      console.warn(chalk.yellow(`Results file not found: ${jtlPath}. Skipping threshold evaluation.`));
      return { passed: true, results: [] };
    }

    const content = fs.readFileSync(jtlPath, "utf-8");
    const lines = content.split(/\r?\n/).filter((l) => l.trim().length > 0);

    // 1. Parse rows
    const rows: { elapsed: number; success: boolean; label: string }[] = [];
    let elapsedIdx = 1;
    let successIdx = 6;
    let labelIdx = 2;

    for (let i = 0; i < lines.length; i++) {
      const parts = parseCsvLine(lines[i] as string);
      if (i === 0) {
        // Detect header
        const isHeaderLine = parts.some((p) => ["timestamp", "elapsed", "label", "success", "responsecode"].includes(p.toLowerCase()));
        if (isHeaderLine) {
          elapsedIdx = parts.findIndex((p) => p.toLowerCase() === "elapsed" || p.toLowerCase() === "time");
          successIdx = parts.findIndex((p) => p.toLowerCase() === "success");
          labelIdx = parts.findIndex((p) => p.toLowerCase() === "label");
          if (elapsedIdx === -1) elapsedIdx = 1;
          if (successIdx === -1) successIdx = 6;
          if (labelIdx === -1) labelIdx = 2;
          continue;
        }
      }

      const elapsed = parseInt(parts[elapsedIdx] ?? "0", 10);
      const success = (parts[successIdx] ?? "true").toLowerCase() === "true";
      const label = parts[labelIdx] ?? "";
      rows.push({ elapsed, success, label });
    }

    if (rows.length === 0) {
      console.warn(chalk.yellow(`No rows found in results file: ${jtlPath}. Skipping threshold evaluation.`));
      return { passed: true, results: [] };
    }

    // 2. Evaluate thresholds
    let allPassed = true;
    const results: ThresholdResult[] = [];

    console.log(chalk.white("\n  ✓ Evaluating Thresholds:"));

    for (const [key, exprs] of Object.entries(thresholds)) {
      // Parse metric name and optional filters, e.g. "http_req_duration" or "http_req_duration{label=Homepage}"
      const match = /^([a-zA-Z0-9_]+)(?:\{([^}]+)\})?$/.exec(key);
      if (!match) {
        console.warn(chalk.yellow(`  Warning: Invalid threshold key: ${key}`));
        continue;
      }

      const baseMetric = match[1];
      const filterExpr = match[2];
      let filteredRows = rows;

      if (filterExpr) {
        const filterParts = filterExpr.split("=");
        const filterKey = filterParts[0]?.trim();
        const filterVal = filterParts[1]?.trim().replace(/^['"]|['"]$/g, ""); // strip quotes
        if (filterKey === "label" || filterKey === "name") {
          filteredRows = rows.filter((r) => r.label === filterVal);
        }
      }

      if (filteredRows.length === 0) {
        console.warn(chalk.yellow(`  Warning: No samples found matching filter for key: ${key}`));
        continue;
      }

      const summary = computeMetrics(filteredRows);

      for (const expr of exprs) {
        const normalized = expr.replace(/\s+/g, "").replace(/p\((\d+)\)/g, "p$1");
        const exprMatch = /^(avg|med|min|max|p90|p95|p99|rate)([<>]=?|=)([\d.]+)$/.exec(normalized);
        if (!exprMatch) {
          console.warn(chalk.yellow(`  Warning: Invalid threshold expression: ${expr}`));
          continue;
        }

        const subMetric = exprMatch[1] as keyof MetricSummary;
        const operator = exprMatch[2];
        const thresholdVal = parseFloat(exprMatch[3] as string);
        const actualVal = summary[subMetric] as number;

        let passed = false;
        switch (operator) {
          case "<": passed = actualVal < thresholdVal; break;
          case ">": passed = actualVal > thresholdVal; break;
          case "<=": passed = actualVal <= thresholdVal; break;
          case ">=": passed = actualVal >= thresholdVal; break;
          case "=": passed = actualVal === thresholdVal; break;
        }

        if (!passed) {
          allPassed = false;
        }

        results.push({
          metric: key,
          expression: expr,
          actualValue: actualVal,
          thresholdValue: thresholdVal,
          passed,
        });

        const statusColor = passed ? chalk.green("✓ Passed") : chalk.red("✗ Failed");
        const formattedActual = baseMetric === "http_req_failed" || subMetric === "rate"
          ? `${(actualVal * 100).toFixed(2)}%`
          : `${actualVal.toFixed(2)}ms`;
        const formattedThreshold = baseMetric === "http_req_failed" || subMetric === "rate"
          ? `${(thresholdVal * 100).toFixed(2)}%`
          : `${thresholdVal.toFixed(2)}ms`;

        console.log(
          `    - ${key} [${expr}]: ${statusColor} (actual: ${formattedActual}, threshold: ${formattedThreshold})`
        );
      }
    }

    console.log();
    return { passed: allPassed, results };
  }
}

// Helper to parse CSV lines handling quotes
function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

function computeMetrics(rows: { elapsed: number; success: boolean }[]): MetricSummary {
  const elapsedTimes = rows.map((r) => r.elapsed).sort((a, b) => a - b);
  const total = rows.length;
  const failed = rows.filter((r) => !r.success).length;

  const sum = elapsedTimes.reduce((acc, v) => acc + v, 0);
  const avg = sum / total;
  const min = elapsedTimes[0] ?? 0;
  const max = elapsedTimes[total - 1] ?? 0;

  const percentile = (p: number) => {
    if (total === 0) return 0;
    const idx = Math.floor(total * p);
    return elapsedTimes[idx] ?? 0;
  };

  return {
    avg,
    med: percentile(0.5),
    min,
    max,
    p90: percentile(0.9),
    p95: percentile(0.95),
    p99: percentile(0.99),
    rate: failed / total,
    total,
    failed,
  };
}
