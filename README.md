# tsx-to-ts

A command-line tool to convert TypeScript React (TSX) files to plain TypeScript
(TS) files by transforming JSX syntax into `React.createElement` calls.

## Installation

```bash
npm install tsx-to-ts
```

## Usage

```bash
npx tsx-to-ts "src/**/*.tsx"
```

This will:

1. Find all TSX files matching the glob pattern
2. Convert JSX syntax to React's automatic JSX runtime (`jsx`/`jsxs` functions)
3. Save new `.ts` files alongside the original `.tsx` files

## How it Works

The tool uses:

- `@babel/core` for code transformation
- `@babel/plugin-transform-react-jsx` with automatic runtime to convert JSX
  syntax
- Babel's TypeScript parser for parsing TSX files

For example, this TSX:

```tsx
const Button = () => <button type="submit">Click me</button>;
```

Gets converted to:

```typescript
import { jsx as _jsx } from "react/jsx-runtime";

const Button = () =>
  _jsx("button", {
    type: "submit",
    children: "Click me",
  });
```

The tool uses React's automatic JSX runtime, which transforms JSX elements into
`jsx` and `jsxs` function calls from `react/jsx-runtime`.

## Development

1. Clone the repository

2. Install dependencies:

```bash
pnpm install
```

3. Build the project:

```bash
pnpm build
```
