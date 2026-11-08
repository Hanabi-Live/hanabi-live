// Prints the source that ESLint fixed, given its JSON report on standard input and the original
// source's path. Fails if any problem remains that ESLint could not fix.

import { readFileSync } from "node:fs";

/** One file's entry in ESLint's JSON report. */
interface LintResult {
  readonly output?: string;
  readonly messages: ReadonlyArray<{
    readonly line?: number;
    readonly message: string;
  }>;
}

const sourcePath = process.argv[2];
if (sourcePath === undefined) {
  throw new Error("Usage: eslint-output.ts <source path>");
}
const [result] = JSON.parse(await Bun.stdin.text()) as readonly LintResult[];
if (result === undefined) {
  throw new Error("ESLint did not report on the generated file.");
}
if (result.messages.length > 0) {
  for (const { line, message } of result.messages) {
    console.error(`line ${line ?? "?"}: ${message}`);
  }
  process.exit(1);
}
process.stdout.write(result.output ?? readFileSync(sourcePath, "utf8"));
