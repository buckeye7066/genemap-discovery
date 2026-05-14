import globals from "globals";
import pluginJs from "@eslint/js";
import pluginReact from "eslint-plugin-react";
import pluginReactHooks from "eslint-plugin-react-hooks";

export default [
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/build/**",
      "**/.next/**",
      "apps/desktop/**",
      "functions/**",
    ],
  },
  // Backend (API) — Node ESM
  {
    files: ["services/api/src/**/*.js"],
    languageOptions: {
      globals: { ...globals.node },
      ecmaVersion: 2023,
      sourceType: "module",
    },
    rules: {
      ...pluginJs.configs.recommended.rules,
      // Tests use globally-injected vi from vitest setup; allow unused
      // catch params (common in defensive try/catch with no use of err).
      "no-unused-vars": ["warn", { args: "none", caughtErrors: "none", varsIgnorePattern: "^_" }],
      "no-empty": ["error", { allowEmptyCatch: true }],
    },
  },
  {
    files: [
      "apps/web/components/**/*.{js,mjs,cjs,jsx}",
      "apps/web/pages/**/*.{js,mjs,cjs,jsx}",
      "apps/web/lib/**/*.{js,mjs,cjs,jsx}",
      "apps/web/Layout.jsx",
      "apps/web/App.jsx",
    ],
    languageOptions: { globals: globals.browser },
    ...pluginJs.configs.recommended,
  },
  {
    files: [
      "apps/web/components/**/*.{js,mjs,cjs,jsx}",
      "apps/web/pages/**/*.{js,mjs,cjs,jsx}",
      "apps/web/lib/**/*.{js,mjs,cjs,jsx}",
      "apps/web/Layout.jsx",
      "apps/web/App.jsx",
    ],
    ...pluginReact.configs.flat.recommended,
    settings: {
      react: {
        version: "detect",
      },
    },
    plugins: {
      react: pluginReact,
      "react-hooks": pluginReactHooks,
    },
    rules: {
      "no-unused-vars": "off",
      "react/prop-types": "off",
      "react/react-in-jsx-scope": "off",
      "react/no-unknown-property": [
        "error",
        { ignore: ["cmdk-input-wrapper", "toast-close"] },
      ],
      "react-hooks/rules-of-hooks": "error",
    },
  },
];
