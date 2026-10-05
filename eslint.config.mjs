import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// Size and complexity limits, in the spirit of SwiftLint's file_length, function_body_length,
// cyclomatic_complexity and nesting rules. Lines here run long, so a file is measured in bytes rather
// than lines. Code that broke a limit before it existed is listed in eslint-suppressions.json, which
// may only shrink: fix a listed spot, then run `npm run lint:prune`.
export const maxFileBytes = 24 * 1024;
const size = {
  rules: {
    "max-file-bytes": {
      meta: {
        type: "suggestion",
        schema: [{ type: "integer", minimum: 1 }],
        messages: { tooLarge: "File is {{kb}} KB; split it below {{limit}} KB." },
      },
      create(context) {
        const limit = context.options[0] ?? maxFileBytes;
        return {
          Program(node) {
            const bytes = Buffer.byteLength(context.sourceCode.text);
            if (bytes > limit) context.report({ node, loc: { line: 1, column: 0 }, messageId: "tooLarge", data: { kb: Math.ceil(bytes / 1024), limit: Math.round(limit / 1024) } });
          },
        };
      },
    },
  },
};

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Local build output, agent worktrees and scratch folders.
    "dist/**",
    ".claude/**",
    ".wrangler/**",
    "outputs/**",
    "work/**",
  ]),
  {
    files: ["app/**/*.{ts,tsx}", "components/**/*.{ts,tsx}", "hooks/**/*.{ts,tsx}", "lib/**/*.{ts,tsx,js}"],
    ignores: ["components/ui/**", "lib/locales/**"],
    plugins: { size },
    rules: {
      "size/max-file-bytes": ["error", maxFileBytes],
      "max-lines-per-function": ["error", { max: 150, skipBlankLines: true, skipComments: true }],
      "max-statements": ["error", 40],
      complexity: ["error", 20],
      "max-depth": ["error", 4],
      "max-nested-callbacks": ["error", 4],
      "max-params": ["error", 5],
    },
  },
  {
    files: ["components/ui/**/*.{ts,tsx}", "hooks/use-mobile.ts"],
    rules: {
      // These files are vendored verbatim from shadcn@4.17.0. Keep the
      // registry source intact while applying the stricter rules to Site code.
      "@typescript-eslint/no-unused-vars": "off",
      "react-hooks/purity": "off",
      "react-hooks/set-state-in-effect": "off",
    },
  },
]);

export default eslintConfig;
