#!/usr/bin/env node

import * as fs from "fs/promises";
import { program } from "commander";
import * as acorn from "acorn";
import { tsPlugin } from "acorn-typescript";
import jsx from "acorn-jsx";
import * as recast from "recast";
import glob from "fast-glob";
import path from "path";

function createReactElementCall(component: any, props: any, children: any[]) {
  return {
    type: "CallExpression",
    callee: {
      type: "MemberExpression",
      object: { type: "Identifier", name: "React" },
      property: { type: "Identifier", name: "createElement" },
      computed: false,
    },
    arguments: [component, props, ...children],
  };
}

function normalizeJSXText(text: string): string | null {
  // If no newlines (intra-line), preserve as-is (including pure spaces/tabs) unless completely empty
  if (!text.includes("\n")) {
    return text !== "" ? text : null;
  }

  // For multi-line: split by newlines, trim each line explicitly (handles all \s whitespace)
  const lines = text.split(/\n/);
  const trimmedLines = lines
    .map((line) => line.replace(/^\s+|\s+$/g, ""))
    .filter((line) => line !== "");

  // Join with single space (collapse newlines/multi-spaces)
  const normalized = trimmedLines.join(" ");

  // Discard if empty after normalization
  return normalized !== "" ? normalized : null;
}

function transformJSXChildren(children: any[]): any[] {
  // Step 1: Merge adjacent JSXText nodes into chunks
  const mergedChildren: any[] = [];
  let currentText = "";

  for (const child of children) {
    if (child.type === "JSXText") {
      currentText += child.value;
    } else {
      // Flush any pending text before non-text child
      if (currentText !== "") {
        const normalized = normalizeJSXText(currentText);
        if (normalized !== null) {
          mergedChildren.push({ type: "JSXText", value: normalized });
        }
        currentText = "";
      }
      mergedChildren.push(child);
    }
  }

  // Flush any trailing text
  if (currentText !== "") {
    const normalized = normalizeJSXText(currentText);
    if (normalized !== null) {
      mergedChildren.push({ type: "JSXText", value: normalized });
    }
  }

  // Step 2: Map the merged children to AST nodes (recursively transform non-text)
  return mergedChildren.map((child: any) => {
    if (child.type === "JSXText") {
      return { type: "Literal", value: child.value };
    }
    if (child.type === "JSXExpressionContainer") {
      return transformJSXElement(child.expression);
    }
    return transformJSXElement(child);
  });
}

function transformJSXElement(node: any): any {
  if (
    node.type !== "JSXElement" &&
    node.type !== "JSXFragment" &&
    node.type !== "JSXExpressionContainer"
  ) {
    for (const key in node) {
      if (Array.isArray(node[key])) {
        node[key] = node[key].map((child: any) =>
          typeof child === "object" && child !== null
            ? transformJSXElement(child)
            : child,
        );
      } else if (typeof node[key] === "object" && node[key] !== null) {
        node[key] = transformJSXElement(node[key]);
      }
    }
    return node;
  }

  if (node.type === "JSXFragment") {
    const children = transformJSXChildren(node.children);

    return createReactElementCall(
      {
        type: "MemberExpression",
        object: { type: "Identifier", name: "React" },
        property: { type: "Identifier", name: "Fragment" },
        computed: false,
      },
      { type: "Literal", value: null },
      children,
    );
  }

  if (node.type === "JSXElement") {
    const name = node.openingElement.name.name;
    const isComponent = name && name[0] === name[0].toUpperCase();

    const nameNode =
      node.openingElement.name.type === "JSXMemberExpression"
        ? transformJSXMemberExpression(node.openingElement.name)
        : isComponent
          ? { type: "Identifier", name: name }
          : { type: "Literal", value: name };

    const props = node.openingElement.attributes.map((attr: any) => {
      if (attr.type === "JSXSpreadAttribute") {
        return {
          type: "SpreadElement",
          argument: transformJSXElement(attr.argument),
        };
      }

      const value = attr.value
        ? attr.value.type === "JSXExpressionContainer"
          ? transformJSXElement(attr.value.expression)
          : transformJSXElement(attr.value)
        : { type: "Literal", value: true };

      return {
        type: "Property",
        key: { type: "Identifier", name: attr.name.name },
        value,
        kind: "init",
        method: false,
        shorthand: false,
        computed: false,
      };
    });

    const children = transformJSXChildren(node.children);

    return createReactElementCall(
      nameNode,
      props.length
        ? {
            type: "TSAsExpression",
            expression: { type: "ObjectExpression", properties: props },
            typeAnnotation: { type: "TSNeverKeyword" },
          }
        : { type: "Literal", value: null },
      children,
    );
  } else if (node.type === "JSXExpressionContainer") {
    return transformJSXElement(node.expression);
  }

  return node;
}

function transformJSXMemberExpression(node: any): any {
  if (node.type === "JSXMemberExpression") {
    return {
      type: "MemberExpression",
      object: transformJSXMemberExpression(node.object),
      property: { type: "Identifier", name: node.property.name },
      computed: false,
    };
  }
  return { type: "Identifier", name: node.name };
}

export const parseTSX = (content: string) => {
  const comments: Array<{
    type: "Line" | "Block";
    value: string;
    start: number;
    end: number;
  }> = [];

  const root = acorn.Parser.extend(tsPlugin() as never)
    .extend(jsx())
    .parse(content, {
      sourceType: "module",
      ecmaVersion: "latest",
      locations: true,
      onComment: (isBlock, text, start, end) => {
        comments.push({
          type: isBlock ? "Block" : "Line",
          value: text,
          start,
          end,
        });
      },
    });

  return { root, comments };
};

export const tsxToTS = (content: string) => {
  const { root, comments } = parseTSX(content);

  const transformedAst = transformJSXElement(root);
  (transformedAst as any).comments = comments;

  return recast.print(transformedAst).code;
};

program.argument("<input>", "input glob").action(async (input) => {
  const files = await glob(input);
  for (const file of files) {
    const parsedPath = path.parse(file);

    const content = await fs.readFile(file, "utf-8");
    const transformed = tsxToTS(content);

    const transformedPath = path.join(parsedPath.dir, `${parsedPath.name}.ts`);
    await fs.writeFile(transformedPath, transformed, "utf-8");
  }
});

program.parse();
