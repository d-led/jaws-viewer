import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "dist/**",
      "coverage/**",
      "playwright-report/**",
      "test-results/**",
      "e2e/.bundle/**",
      "data/**",
    ],
  },
  ...tseslint.configs.recommended,
  {
    files: ["**/*.ts"],
    extends: [...tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: {
        // Type-aware rules need the project. typescript-eslint resolves the TypeScript 6
        // compatibility package, because TypeScript 7 ships no compiler API yet.
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Deliberately shared with oxlint: where both linters can see a problem, they should
      // agree about it, and one suppression comment should satisfy both.
      "no-await-in-loop": "error",
    },
  },
);
