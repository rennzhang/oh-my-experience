import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export function packageInfo() {
  const root = packageRoot();
  if (!root) return { name: "oh-my-experience", version: "unknown" };
  try {
    const parsed = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
    return { name: parsed.name || "oh-my-experience", version: parsed.version || "unknown" };
  } catch {
    return { name: "oh-my-experience", version: "unknown" };
  }
}

export function packageRoot() {
  let dir = path.dirname(fileURLToPath(import.meta.url));
  for (let depth = 0; depth < 8; depth += 1) {
    const candidate = path.join(dir, "package.json");
    if (fs.existsSync(candidate)) {
      try {
        const parsed = JSON.parse(fs.readFileSync(candidate, "utf8"));
        if (parsed?.name === "oh-my-experience") return dir;
      } catch {
        // Keep walking up if an unexpected package.json is not parseable.
      }
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return "";
}
