import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    ".next/**",
    "evals/.raw/**",
    "out/**",
    "build/**",
    "playwright-report/**",
    "test-results/**",
    "next-env.d.ts",
    // Vendored ONNX Runtime browser loader; audited by its upstream package.
    "public/ort/**",
  ]),
]);
