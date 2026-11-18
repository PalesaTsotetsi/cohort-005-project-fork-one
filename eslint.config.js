import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

// Each rule here enforces a mechanical rule from CODING_STANDARDS.md, so the
// reviewer agent spends its attention on judgement calls instead.
const castOnInput =
  "Parse untrusted input with a zod schema (see `parseFormData` in app/lib/validation.ts), not a cast.";

export default tseslint.config(
  {
    ignores: [
      "build/",
      ".react-router/",
      "node_modules/",
      "drizzle/",
      ".claude/worktrees/",
    ],
  },
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: { parser: tseslint.parser },
    // react-hooks is registered, not enabled, so existing
    // `eslint-disable-next-line react-hooks/...` comments still resolve.
    plugins: {
      "@typescript-eslint": tseslint.plugin,
      "react-hooks": reactHooks,
    },
    linterOptions: { reportUnusedDisableDirectives: "off" },
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-non-null-assertion": "error",
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "TSAsExpression > CallExpression.expression[callee.property.name='get'][callee.object.name=/formData|searchParams/i]",
          message: castOnInput,
        },
        {
          selector:
            "TSAsExpression > CallExpression.expression[callee.property.name='get'][callee.object.property.name=/formData|searchParams/i]",
          message: castOnInput,
        },
      ],
    },
  }
);
