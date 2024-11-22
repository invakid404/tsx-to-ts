#!/usr/bin/env node

import * as fs from "fs/promises";
import { program } from "commander";
import * as acorn from "acorn";
import { tsPlugin } from "acorn-typescript";
import jsx from "acorn-jsx";
import * as astring from "astring";
import glob from "fast-glob";
import path from "path";

function transformJSXElement(node: any): any {
  if (node.type === "JSXElement") {
    const name = node.openingElement.name.name;
    const isComponent = name[0] === name[0].toUpperCase();
    const nameNode = isComponent
      ? { type: "Identifier", name: name }
      : { type: "Literal", value: name };

    const props = node.openingElement.attributes.map((attr: any) => ({
      type: "Property",
      key: { type: "Identifier", name: attr.name.name },
      value: attr.value
        ? transformJSXElement(attr.value)
        : { type: "Literal", value: true },
      kind: "init",
      method: false,
      shorthand: false,
      computed: false,
    }));

    // Transform children
    const children = node.children
      .filter((child: any) => child.type !== "JSXText" || child.value.trim())
      .map((child: any) => {
        if (child.type === "JSXText") {
          return { type: "Literal", value: child.value.trim() };
        }
        return transformJSXElement(child);
      });

    return {
      type: "CallExpression",
      callee: {
        type: "MemberExpression",
        object: { type: "Identifier", name: "React" },
        property: { type: "Identifier", name: "createElement" },
        computed: false,
      },
      arguments: [
        nameNode,
        props.length
          ? {
              type: "TSAsExpression",
              expression: { type: "ObjectExpression", properties: props },
              typeAnnotation: { type: "TSNeverKeyword" },
            }
          : { type: "Literal", value: null },
        ...children,
      ],
    };
  } else if (node.type === "JSXExpressionContainer") {
    return node.expression;
  }

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

export const tsxToTS = (content: string) => {
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

  const transformedAst = transformJSXElement(root);
  (transformedAst as any).comments = comments;

  const customGenerator = {
    ...astring.GENERATOR,
    TSAsExpression: function (node: any, state: any) {
      (this as any)[node.expression.type](node.expression, state);
      state.write(" as ");
      (this as any)[node.typeAnnotation.type](node.typeAnnotation, state);
    },
    TSNeverKeyword: function (_node: any, state: any) {
      state.write("never");
    },
  };

  return astring.generate(transformedAst, {
    generator: customGenerator,
    comments: true,
  });
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
