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
2. Convert JSX syntax to `React.createElement` calls
3. Save new `.ts` files alongside the original `.tsx` files

## How it Works

The tool uses:

- `acorn` with TypeScript and JSX plugins for parsing
- AST transformation to convert JSX elements to `React.createElement` calls
- `recast` for code generation

For example, this TSX:

```tsx
const Button = () => <button type="submit">Click me</button>;
```

Gets converted to:

```typescript
const Button = () =>
  React.createElement("button", { type: "submit" } as never, "Click me");
```

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
