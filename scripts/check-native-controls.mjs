import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const FORBIDDEN_INTRINSICS = new Set([
  "a",
  "button",
  "input",
  "label",
  "optgroup",
  "option",
  "select",
  "textarea",
]);

const INTERACTIVE_CONTAINERS = new Set(["div", "li", "span"]);
const ACTIVATION_HANDLERS = new Set([
  "onClick",
  "onKeyDown",
  "onKeyPress",
  "onKeyUp",
  "onPointerDown",
]);
const EXCLUDED_PREFIXES = ["src/components/ui/", "src/generated/"];

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
    projectPath.endsWith(".tsx") &&
    !projectPath.startsWith("../") &&
    !EXCLUDED_PREFIXES.some((prefix) => projectPath.startsWith(prefix))
  );
}

function getAttribute(openingElement, name) {
  return openingElement.attributes.properties.find(
    (property) => ts.isJsxAttribute(property) && property.name.text === name,
  );
}

function hasAttribute(openingElement, name) {
  return getAttribute(openingElement, name) !== undefined;
}

function hasStaticStringValue(attribute, expectedValue) {
  if (!attribute?.initializer) return false;
  if (ts.isStringLiteral(attribute.initializer)) {
    return attribute.initializer.text === expectedValue;
  }
  if (!ts.isJsxExpression(attribute.initializer)) return false;

  let expression = attribute.initializer.expression;
  while (expression && ts.isParenthesizedExpression(expression)) {
    expression = expression.expression;
  }

  return (
    expression !== undefined &&
    (ts.isStringLiteral(expression) ||
      ts.isNoSubstitutionTemplateLiteral(expression)) &&
    expression.text === expectedValue
  );
}

function hasSpreadAttribute(openingElement) {
  return openingElement.attributes.properties.some((property) =>
    ts.isJsxSpreadAttribute(property),
  );
}

function classifyInteractiveContainer(openingElement) {
  const hasButtonRole = hasStaticStringValue(
    getAttribute(openingElement, "role"),
    "button",
  );
  const hasTabIndex = hasAttribute(openingElement, "tabIndex");

  if (hasSpreadAttribute(openingElement) && (hasButtonRole || hasTabIndex)) {
    return "spread";
  }

  if (hasButtonRole) return "role";

  if (
    hasTabIndex &&
    [...ACTIVATION_HANDLERS].some((handler) =>
      hasAttribute(openingElement, handler),
    )
  ) {
    return "activation";
  }

  return null;
}

export function scanSourceText(sourceText, filePath) {
  const sourceFile = ts.createSourceFile(
    filePath,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const diagnostics = [];

  function report(node, message) {
    const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart());
    diagnostics.push({ filePath, line: line + 1, message });
  }

  function visit(node) {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tagName = node.tagName.getText(sourceFile);

      if (FORBIDDEN_INTRINSICS.has(tagName)) {
        report(
          node,
          `raw <${tagName}> is forbidden; use the standardized UI component`,
        );
      } else if (INTERACTIVE_CONTAINERS.has(tagName)) {
        const interaction = classifyInteractiveContainer(node);
        if (interaction === "spread") {
          report(
            node,
            `interactive <${tagName}> with role="button" or tabIndex plus spread attributes is forbidden; activation handlers cannot be proven absent`,
          );
        } else if (interaction !== null) {
          report(
            node,
            `interactive <${tagName}> is forbidden; use Button or another semantic UI component`,
          );
        }
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return diagnostics;
}

export function scanSourceFile(
  sourceText,
  filePath,
  projectRoot = process.cwd(),
) {
  if (!shouldScanPath(filePath, projectRoot)) return [];

  return scanSourceText(
    sourceText,
    normalizeProjectPath(filePath, projectRoot),
  );
}

async function collectTsxFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectTsxFiles(entryPath)));
    } else if (entry.isFile() && entry.name.endsWith(".tsx")) {
      files.push(entryPath);
    }
  }

  return files;
}

async function main() {
  const projectRoot = process.cwd();
  const sourceRoot = path.join(projectRoot, "src");
  const filePaths = await collectTsxFiles(sourceRoot);
  const diagnostics = [];

  for (const filePath of filePaths) {
    if (!shouldScanPath(filePath, projectRoot)) continue;
    const sourceText = await readFile(filePath, "utf8");
    diagnostics.push(...scanSourceFile(sourceText, filePath, projectRoot));
  }

  diagnostics.sort(
    (left, right) =>
      left.filePath.localeCompare(right.filePath) || left.line - right.line,
  );

  for (const diagnostic of diagnostics) {
    console.error(
      `${diagnostic.filePath}:${diagnostic.line} ${diagnostic.message}`,
    );
  }

  if (diagnostics.length > 0) {
    console.error(`Found ${diagnostics.length} forbidden native control(s).`);
    process.exitCode = 1;
  } else {
    console.log("Native control guard passed: 0 forbidden controls.");
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
