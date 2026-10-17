import test from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import ts from "typescript";

const root = new URL("../../", import.meta.url);
const visibleAttributes = new Set(["title", "alt", "placeholder", "aria-label", "label", "body", "helper"]);
const copyProperties = new Set(["title", "body", "label", "description", "message", "error", "helper", "text"]);

async function sourceFiles(directory) {
  const entries = await readdir(new URL(directory, root), { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = `${directory}/${entry.name}`;
    if (entry.isDirectory()) files.push(...await sourceFiles(path));
    else if (/\.[cm]?[jt]sx?$/.test(entry.name) && !/\.test\./.test(entry.name)) files.push(path);
  }
  return files;
}

function attributeFor(node) {
  for (let parent = node.parent; parent; parent = parent.parent) {
    if (ts.isJsxAttribute(parent)) return parent.name.getText();
    if (ts.isStatement(parent)) break;
  }
  return null;
}

test("product copy describes activity suggestions, not the retired board interface", async () => {
  const failures = [];
  for (const path of [...await sourceFiles("src"), "server/routes/ai.js", "server/services/boardService.js"]) {
    const source = ts.createSourceFile(path, await readFile(new URL(path, root), "utf8"), ts.ScriptTarget.Latest, true,
      path.endsWith("jsx") ? ts.ScriptKind.JSX : ts.ScriptKind.JS);
    function visit(node) {
      const literal = ts.isStringLiteralLike(node) || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node);
      if (ts.isJsxText(node) || literal) {
        const text = node.text;
        const attribute = attributeFor(node);
        const property = ts.isPropertyAssignment(node.parent) ? node.parent.name.getText(source) : "";
        const visible = ts.isJsxText(node) || (attribute ? visibleAttributes.has(attribute)
          : /\s/.test(text) || copyProperties.has(property));
        if (visible && /\bboards?\b/i.test(text)) {
          const { line } = source.getLineAndCharacterOfPosition(node.getStart(source));
          failures.push(`${path}:${line + 1}: ${text.trim()}`);
        }
      }
      ts.forEachChild(node, visit);
    }
    visit(source);
  }
  assert.deepEqual(failures, [], `Retired terminology in product copy:\n${failures.join("\n")}`);
});
