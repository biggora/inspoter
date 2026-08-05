import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

// English is the base language of the product: every operator-visible string is
// authored in src/messages/en, everything under src/messages/<locale> is a
// translation of it, and no source file spells product copy in another language
// directly. Non-Latin script in src/ is the cheap, reliable signal that
// something slipped back — this guard is what keeps the next producer from
// quietly writing "Сервис снова доступен" into the database again.
//
// Deliberately narrow: it only looks for Cyrillic, and only under src/. It is
// a regression guard for this codebase's actual history, not a general
// natural-language detector.

const CYRILLIC = /[Ѐ-ӿ]/;
const SCANNED_EXTENSIONS = [".ts", ".tsx"];

// Every entry is a source file whose non-Latin text is NOT product copy.
// Adding to this list is a decision, not a formality: state why the text
// cannot be a message-catalog key.
export const ALLOWLIST = new Map([
  [
    "src/lib/mail/imap-smtp.ts",
    "Matches folder names chosen by a remote IMAP server, which Inspoter only reads.",
  ],
  [
    "src/components/shell/language-switcher.tsx",
    "Language names are shown in their own language in every locale, by convention.",
  ],
]);

const EXCLUDED_PREFIXES = ["src/messages/", "src/generated/"];

function normalizeProjectPath(filePath, projectRoot) {
  const relativePath = path.isAbsolute(filePath)
    ? path.relative(projectRoot, filePath)
    : filePath;

  return relativePath.replaceAll("\\", "/").replace(/^\.\//, "");
}

export function shouldScanPath(filePath, projectRoot = process.cwd()) {
  const projectPath = normalizeProjectPath(filePath, projectRoot);

  return (
    projectPath.startsWith("src/") &&
    !projectPath.startsWith("../") &&
    SCANNED_EXTENSIONS.some((ext) => projectPath.endsWith(ext)) &&
    !EXCLUDED_PREFIXES.some((prefix) => projectPath.startsWith(prefix)) &&
    !ALLOWLIST.has(projectPath)
  );
}

export function scanSourceText(sourceText, projectPath) {
  return sourceText
    .split(/\r?\n/)
    .map((line, index) => ({ line, number: index + 1 }))
    .filter((entry) => CYRILLIC.test(entry.line))
    .map((entry) => ({
      filePath: projectPath,
      line: entry.number,
      text: entry.line.trim().slice(0, 100),
    }));
}

async function collectSourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectSourceFiles(entryPath)));
    } else if (
      entry.isFile() &&
      SCANNED_EXTENSIONS.some((ext) => entry.name.endsWith(ext))
    ) {
      files.push(entryPath);
    }
  }

  return files;
}

async function main() {
  const projectRoot = process.cwd();
  const filePaths = await collectSourceFiles(path.join(projectRoot, "src"));
  const findings = [];

  for (const filePath of filePaths) {
    if (!shouldScanPath(filePath, projectRoot)) continue;
    const sourceText = await readFile(filePath, "utf8");
    findings.push(
      ...scanSourceText(
        sourceText,
        normalizeProjectPath(filePath, projectRoot),
      ),
    );
  }

  findings.sort(
    (left, right) =>
      left.filePath.localeCompare(right.filePath) || left.line - right.line,
  );

  for (const finding of findings) {
    console.error(`${finding.filePath}:${finding.line} ${finding.text}`);
  }

  if (findings.length > 0) {
    console.error(
      `Found ${findings.length} non-base-language string(s) in src/. Move operator-visible text into src/messages/en (plus every other locale), or add the file to ALLOWLIST in scripts/check-base-language.mjs with a reason.`,
    );
    process.exitCode = 1;
  } else {
    console.log("Base language guard passed: 0 non-base-language strings.");
  }
}

const isMainModule =
  process.argv[1] !== undefined &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;

if (isMainModule) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
