#!/usr/bin/env node

import * as fs from "fs/promises";
import { program } from "commander";
import * as acorn from "acorn";
import { tsPlugin } from "acorn-typescript";
import jsx from "acorn-jsx";
import * as recast from "recast";
import glob from "fast-glob";
import path from "path";

function transformJSXElement(node: any): any {
  if (node.type !== "JSXElement" && node.type !== "JSXFragment" && node.type !== "JSXExpressionContainer") {
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
    return {
      type: "CallExpression",
      callee: {
        type: "MemberExpression",
        object: { type: "Identifier", name: "React" },
        property: { type: "Identifier", name: "Fragment" },
        computed: false,
      },
      arguments: [
        { type: "Literal", value: null },
        ...node.children.map((child: any) => transformJSXElement(child)),
      ],
    };
  }

  if (node.type === "JSXElement") {
    const name = node.openingElement.name.name;
    const isComponent = name && name[0] === name[0].toUpperCase();
    
    const nameNode = node.openingElement.name.type === "JSXMemberExpression"
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

    const children = node.children
      .filter((child: any) => {
        if (child.type === "JSXText") {
          return child.value.trim();
        }
        return true;
      })
      .map((child: any) => {
        if (child.type === "JSXText") {
          return { type: "Literal", value: child.value.trim() };
        }
        if (child.type === "JSXExpressionContainer") {
          return transformJSXElement(child.expression);
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
              type: "ObjectExpression",
              properties: props,
            }
          : { type: "Literal", value: null },
        ...children,
      ],
    };
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
