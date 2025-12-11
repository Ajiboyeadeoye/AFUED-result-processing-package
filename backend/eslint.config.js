import eslintPluginImport from "eslint-plugin-import";

export default [
  {
    files: ["**/*.js"],
    languageOptions: {
      ecmaVersion: 2025,
      sourceType: "module",
      globals: {
        console: "readonly",
        process: "readonly",
        __dirname: "readonly",
        __filename: "readonly"
      }
    },
    plugins: {
      import: eslintPluginImport
    },
    rules: {
      "no-undef": "error",            // catch undefined variables
      "no-unused-vars": "warn",       // warn for unused vars
      "import/no-unresolved": "error" // catch missing imports
    }
  }
];
