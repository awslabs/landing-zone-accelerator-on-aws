import { defineConfig } from "eslint/config";
import typescriptEslint from "@typescript-eslint/eslint-plugin";
import globals from "globals";
import tsParser from "@typescript-eslint/parser";
import path from "node:path";
import { fileURLToPath } from "node:url";
import js from "@eslint/js";
import { FlatCompat } from "@eslint/eslintrc";
import { includeIgnoreFile } from "@eslint/compat";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const compat = new FlatCompat({
    baseDirectory: __dirname,
    recommendedConfig: js.configs.recommended,
    allConfig: js.configs.all
});

const gitignorePath = fileURLToPath(new URL(".gitignore", import.meta.url));
export default defineConfig(
    includeIgnoreFile(gitignorePath, "Imported .gitignore patterns"),
    {
        extends: compat.extends(
            "eslint:recommended",
            "plugin:@typescript-eslint/recommended",
            "plugin:prettier/recommended",
        ),

        plugins: {
            "@typescript-eslint": typescriptEslint,
        },

        languageOptions: {
            globals: {
                ...globals.node,
                require: true,
            },

            parser: tsParser,
            ecmaVersion: 12,
            sourceType: "module",
        },

        rules: {
            "dot-notation": "off",
            "no-case-declarations": "off",
            "@typescript-eslint/no-non-null-assertion": "off",
            "@typescript-eslint/camelcase": "off",
            "@typescript-eslint/no-var-requires": 0,
            "@typescript-eslint/ban-ts-comment": "off",
        },
    },
);
