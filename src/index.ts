#!/usr/bin/env node

import * as fs from "fs/promises";
import { program } from "commander";
import { transformAsync } from "@babel/core";
// @ts-expect-error
import transformReactJSX from "@babel/plugin-transform-react-jsx";
import glob from "fast-glob";
import path from "path";

export const tsxToTS = async (content: string) => {
  const result = await transformAsync(content, {
    plugins: [
      [
        transformReactJSX,
        {
          runtime: "automatic",
        },
      ],
    ],
    parserOpts: {
      plugins: ["typescript", "jsx"],
    },
    retainLines: false,
    compact: false,
    shouldPrintComment: (comment) => {
      return !/^#__PURE__$/.test(comment);
    },
  });

  if (!result || !result.code) {
    throw new Error("Failed to transform code");
  }

  return result.code;
};

program.argument("<input>", "input glob").action(async (input) => {
  const files = await glob(input);
  for (const file of files) {
    const parsedPath = path.parse(file);

    const content = await fs.readFile(file, "utf-8");
    const transformed = await tsxToTS(content);

    const transformedPath = path.join(parsedPath.dir, `${parsedPath.name}.ts`);
    await fs.writeFile(transformedPath, transformed, "utf-8");
  }
});

program.parse();
