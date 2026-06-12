import type { CsvDataSetConfig, CsvNode } from "../types/index.js";

// ─── csvDataSet ───────────────────────────────────────────────────────────────
// Mirrors k6's SharedArray / papaparse pattern but maps to JMeter's
// CSV Data Set Config element.
//
// Usage:
//   const users = csvDataSet("./users.csv");
//   const products = csvDataSet("./products.csv", {
//     variableNames: ["id", "name", "price"],
//     delimiter: "|",
//     recycle: false,
//   });
//
// Variable values are referenced in scripts as "${varName}" strings,
// which JMeter resolves at runtime per-thread.

export function csvDataSet(
  filename: string,
  options: Partial<Omit<CsvDataSetConfig, "filename">> = {}
): CsvNode & { var: (name: string) => string } {
  const config: CsvDataSetConfig = {
    filename,
    delimiter: options.delimiter ?? ",",
    recycle: options.recycle ?? true,
    stopThread: options.stopThread ?? false,
    shareMode: options.shareMode ?? "all",
    ...(options.variableNames ? { variableNames: options.variableNames } : {}),
  };

  return {
    type: "csv",
    config,
    // Convenience: users.var("username") → "${username}"
    // Lets scripts stay readable while making the JMeter variable explicit.
    var(name: string): string {
      return `\${${name}}`;
    },
  };
}
