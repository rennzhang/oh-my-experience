import fs from "node:fs";
import path from "node:path";
import { buildCardIndex, type CardIndexEntry } from "./cards.js";
import { detectProjectContext } from "./project-context.js";
import type { ProjectContext } from "./schema.js";
import { layout, nowIso, writeTextAtomic } from "./storage.js";

export const PROJECT_LIBRARY_DIR_NAME = ".oh-my-experience";

export type LibraryScope = "global" | "project";

export interface ExperienceLibrary {
  scope: LibraryScope;
  dataDir: string;
  projectRoot: string | null;
  exists: boolean;
  readable: boolean;
  warnings: string[];
}

export interface LibraryStack {
  projectContext: ProjectContext;
  libraries: ExperienceLibrary[];
  warnings: string[];
}

export function projectLibraryPath(projectRoot: string): string {
  return path.join(projectRoot, PROJECT_LIBRARY_DIR_NAME);
}

export function resolveLibraryStack(globalDataDir: string, cwd: string | null | undefined = process.cwd()): LibraryStack {
  const projectContext = detectProjectContext(cwd || process.cwd());
  const libraries: ExperienceLibrary[] = [
    {
      scope: "global",
      dataDir: path.resolve(globalDataDir),
      projectRoot: null,
      exists: true,
      readable: true,
      warnings: [],
    },
  ];
  if (projectContext.root) {
    libraries.push(inspectProjectLibrary(projectContext.root));
  }
  const warnings = libraries.flatMap((library) => library.warnings);
  return { projectContext, libraries, warnings };
}

export function inspectProjectLibrary(projectRoot: string): ExperienceLibrary {
  const dataDir = projectLibraryPath(projectRoot);
  const warnings: string[] = [];
  if (!fs.existsSync(dataDir)) {
    return { scope: "project", dataDir, projectRoot, exists: false, readable: false, warnings };
  }
  if (!fs.statSync(dataDir).isDirectory()) {
    warnings.push(`project library is not a directory: ${dataDir}`);
    return { scope: "project", dataDir, projectRoot, exists: true, readable: false, warnings };
  }
  const activeDir = layout(dataDir).activeExperiences;
  if (!fs.existsSync(activeDir)) {
    warnings.push(`project library is missing experiences/active: ${dataDir}`);
    return { scope: "project", dataDir, projectRoot, exists: true, readable: false, warnings };
  }
  return { scope: "project", dataDir, projectRoot, exists: true, readable: true, warnings };
}

export function readLibraryCards(library: ExperienceLibrary): CardIndexEntry[] {
  if (!library.readable) return [];
  const index = buildCardIndex(library.dataDir);
  return (index.experiences || []).map((card) => ({
    ...card,
    libraryScope: library.scope,
    libraryPath: library.dataDir,
    projectRoot: library.projectRoot,
  }));
}

export function readLibraryStackCards(stack: LibraryStack): CardIndexEntry[] {
  return stack.libraries.flatMap((library) => readLibraryCards(library));
}

export function initializeProjectLibrary(projectRoot: string) {
  const root = path.resolve(projectRoot);
  const dataDir = projectLibraryPath(root);
  fs.mkdirSync(layout(dataDir).draftExperiences, { recursive: true });
  fs.mkdirSync(layout(dataDir).activeExperiences, { recursive: true });
  fs.mkdirSync(layout(dataDir).archivedExperiences, { recursive: true });
  writeProjectFileIfMissing(dataDir, "README.md", projectReadme());
  writeProjectFileIfMissing(dataDir, ".gitignore", projectGitignore());
  return {
    ok: true,
    projectRoot: root,
    projectLibrary: dataDir,
    createdAt: nowIso(),
    directories: [
      "experiences/draft",
      "experiences/active",
      "experiences/archived",
    ],
    files: ["README.md", ".gitignore"],
  };
}

function writeProjectFileIfMissing(dataDir: string, relativePath: string, content: string): void {
  const target = path.join(dataDir, relativePath);
  if (fs.existsSync(target)) return;
  writeTextAtomic(target, content, dataDir);
}

function projectReadme(): string {
  return `# Project OME Library

This directory stores Oh My Experience cards that apply only to this project.

- Put active project-specific cards in \`experiences/active/\`.
- Keep global, cross-project lessons in your global OME library.
- OME reads this library at prompt time when the current working directory is inside this project.
- Hook events and stats stay in the global library; prompt-time recall does not write project files.
`;
}

function projectGitignore(): string {
  return `events.jsonl
retrospectives/
indexes/
*.tmp
`;
}
