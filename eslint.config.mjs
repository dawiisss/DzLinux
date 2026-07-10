import js from "@eslint/js";
import globals from "globals";

export default [
  {
    ignores: [
      "node_modules/",
      "dist/",
      "build/",
      "filteredJsons/",
      "scripts/filteredJsons/",
      "server-portal/node_modules/",
      "_experiments/",
      "eslint.config.mjs",
    ],
  },
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "script",
      globals: {
        ...globals.node,
        ...globals.browser,
      },
    },
    rules: {
      "no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "no-console": "off",
      "no-undef": "error",
      "no-empty": ["error", { allowEmptyCatch: true }],
      "no-constant-condition": ["error", { checkLoops: false }],
      "prefer-const": "warn",
      "no-var": "warn",
      "no-dupe-keys": "warn",
      "no-redeclare": "warn",
      "no-useless-assignment": "off",
    },
  },
  {
    files: ["src/renderer/**/*.js"],
    languageOptions: {
      sourceType: "module",
    },
  },
  {
    files: ["**/__tests__/**/*.js"],
    languageOptions: {
      globals: {
        ...globals.jest,
        jest: "readonly",
        describe: "readonly",
        test: "readonly",
        it: "readonly",
        expect: "readonly",
        beforeEach: "readonly",
        afterEach: "readonly",
        beforeAll: "readonly",
        afterAll: "readonly",
      },
    },
  },
];
