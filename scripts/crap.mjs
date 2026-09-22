#!/usr/bin/env node
// CRAP (Change Risk Anti-Patterns) scores, so complexity is only ever allowed to be high where
// the tests actually reach it. For one function:
//
//     crap = cc² × (1 − coverage)³ + cc
//
// A high score means "complex and under-tested" — the combination that makes a change risky.
//
// Nothing is computed here that a library already does: the cyclomatic complexity comes from
// oxlint's `complexity` rule (see .oxlintrc.metrics.json) and the coverage from Vitest's
// Istanbul report. This script only joins the two on file and line, and applies the formula.
//
// Usage: node scripts/crap.mjs [--top N]
// Env:   CRAP_MAX (default 30), COMPLEXITY_MAX (default 12), COVERAGE_FILE, TOP
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { relative } from "node:path";

const CRAP_MAX = Number(process.env.CRAP_MAX ?? 30);
const COMPLEXITY_MAX = Number(process.env.COMPLEXITY_MAX ?? 12);
const COVERAGE_FILE =
  process.env.COVERAGE_FILE ?? "coverage/coverage-final.json";

const topOption = process.argv.indexOf("--top");
const REPORT_COUNT = Number(
  process.env.TOP ?? (topOption === -1 ? 15 : process.argv[topOption + 1]),
);

const red = (s) => `\u001b[31m${s}\u001b[0m`;
const bold = (s) => `\u001b[1m${s}\u001b[0m`;

/** Every function oxlint finds complex enough to report, as `{ file, line, name, cc }`. */
function complexities() {
  const raw = run([
    "npx",
    "oxlint",
    "-c",
    ".oxlintrc.metrics.json",
    "--format=json",
    "src",
  ]);
  const { diagnostics = [] } = JSON.parse(raw);

  return diagnostics.flatMap((diagnostic) => {
    const cc = /complexity of (\d+)/.exec(diagnostic.message)?.[1];
    const line = diagnostic.labels?.[0]?.span?.line;
    if (cc === undefined || line === undefined) return [];

    return [
      {
        file: diagnostic.filename,
        line,
        name: /function `([^`]+)`/.exec(diagnostic.message)?.[1] ?? "anonymous",
        cc: Number(cc),
      },
    ];
  });
}

/** oxlint exits 1 when it reports anything, which is exactly when we want its output. */
function run(command) {
  try {
    return execFileSync(command[0], command.slice(1), { encoding: "utf8" });
  } catch (error) {
    if (typeof error.stdout === "string") return error.stdout;
    throw error;
  }
}

/** The Istanbul report, keyed by the repository-relative file name. */
function coverage() {
  const report = JSON.parse(readFileSync(COVERAGE_FILE, "utf8"));

  return new Map(
    Object.entries(report).map(([file, data]) => [
      relative(process.cwd(), file),
      data,
    ]),
  );
}

/** The share of a function's statements the tests ran, or 0 when the file was never loaded. */
function coveredShare(data, functionLine) {
  if (data === undefined) return 0;

  const entry = Object.values(data.fnMap ?? {}).find(
    (mapped) => Math.abs(mapped.decl.start.line - functionLine) <= 2,
  );
  if (entry === undefined) return 0;

  const first = entry.decl.start.line;
  const last = entry.loc.end.line;
  const statements = Object.values(data.statementMap ?? {}).filter(
    (statement) =>
      statement.start.line >= first && statement.start.line <= last,
  );
  if (statements.length === 0) return 0;

  const hits = Object.values(data.s ?? {});
  const covered = statements.filter(
    (_statement, index) => Number(hits[index] ?? 0) > 0,
  ).length;
  return covered / statements.length;
}

const report = coverage();
const rows = complexities()
  .map(({ file, line, name, cc }) => {
    const share = coveredShare(report.get(file), line);
    return {
      file,
      line,
      name,
      cc,
      share,
      crap: cc ** 2 * (1 - share) ** 3 + cc,
    };
  })
  .toSorted((left, right) => right.crap - left.crap);

const percent = (share) => `${(share * 100).toFixed(0)}%`;
const pad = (text, width) => String(text).padEnd(width);

console.log(
  bold("\nCRAP scores (complexity allowed only where tests reach it)\n"),
);
console.log(
  `  ${pad("file:line", 40)} ${pad("function", 26)} ${pad("cc", 4)} ${pad("cov", 5)} crap`,
);
console.log(
  `  ${"-".repeat(40)} ${"-".repeat(26)} ${"-".repeat(4)} ${"-".repeat(5)} ----`,
);

for (const row of rows.slice(0, REPORT_COUNT)) {
  const tooComplex = row.cc > COMPLEXITY_MAX;
  const tooRisky = row.crap > CRAP_MAX;
  const mark = tooComplex || tooRisky ? red("!") : " ";
  const location = `${row.file}:${row.line}`;
  console.log(
    `${mark} ${pad(location, 40)} ${pad(row.name, 26)} ${pad(row.cc, 4)} ${pad(percent(row.share), 5)} ${row.crap.toFixed(1)}`,
  );
}

const offenders = rows.filter(
  (row) => row.cc > COMPLEXITY_MAX || row.crap > CRAP_MAX,
);
console.log(
  `\n  ${rows.length} functions analysed · complexity limit ${COMPLEXITY_MAX} · CRAP limit ${CRAP_MAX}`,
);

if (offenders.length === 0) {
  console.log(`  no function is both complex and untested beyond the limits\n`);
  process.exit(0);
}

console.log(
  `\n${red("  " + offenders.length + " function(s) need attention:")}\n` +
    offenders
      .map((row) => {
        const why = [
          row.cc > COMPLEXITY_MAX
            ? `complexity ${row.cc} > ${COMPLEXITY_MAX}`
            : null,
          row.crap > CRAP_MAX
            ? `CRAP ${row.crap.toFixed(1)} > ${CRAP_MAX}`
            : null,
        ]
          .filter(Boolean)
          .join(", ");
        const remedy =
          row.share < 0.5
            ? "add tests for its branches"
            : "split it into smaller functions";
        return `    ${row.file}:${row.line} ${row.name} — ${why}; ${remedy}`;
      })
      .join("\n") +
    `\n`,
);
process.exit(1);
