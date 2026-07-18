#!/usr/bin/env node

import { runCli } from "../dist/packages/cli/src/main.js";

runCli(process.argv.slice(2)).catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  const formatIndex = process.argv.indexOf("--format");
  const wantsJson = process.argv.includes("--json")
    || process.argv.includes("--format=json")
    || (formatIndex !== -1 && process.argv[formatIndex + 1] === "json");
  if (wantsJson) {
    const structured = error && typeof error === "object"
      ? {
          ...(typeof error.code === "string" ? { code: error.code } : {}),
          ...(error.details !== undefined ? { details: error.details } : {}),
        }
      : {};
    console.log(JSON.stringify({
      ok: false,
      error: {
        ...structured,
        message,
      },
    }, null, 2));
  } else {
    console.error(`oh-my-experience: ${message}`);
  }
  process.exitCode = 1;
});
