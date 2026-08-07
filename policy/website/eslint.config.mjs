import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

// ESLint 9 flat config. `eslint-config-next` 15.x still ships eslintrc-style
// configs only (no `eslint-config-next/flat` entry point), so they're bridged
// through FlatCompat — the same shape `create-next-app` generates for Next 15.
// `next lint` is deprecated and drops into an interactive setup prompt when no
// config exists, which would hang CI forever; `npm run lint` calls `eslint`
// directly instead.
const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)) });

const eslintConfig = [
  { ignores: [".next/**", "node_modules/**", "next-env.d.ts", "public/**"] },

  ...compat.extends("next/core-web-vitals", "next/typescript"),

  {
    rules: {
      // `next/core-web-vitals` enables only a handful of jsx-a11y rules (alt-text,
      // aria-props and friends). The accessibility defects this codebase actually
      // shipped were interactive `<span onClick>` chips and `<label>`s rendered as
      // siblings of their input — neither of which that subset catches. These four
      // are the rules that do, so the class of bug can't come back silently.
      "jsx-a11y/click-events-have-key-events": "error",
      "jsx-a11y/no-static-element-interactions": "error",
      "jsx-a11y/interactive-supports-focus": "error",
      "jsx-a11y/label-has-associated-control": [
        "error",
        // A group label (Sectors, Markets, a scoping question) legitimately names
        // a set of controls via aria-labelledby rather than wrapping or pointing at
        // one input, so `nesting` alone would be too strict; `htmlFor` covers the
        // single-control fields and the group cases use a non-<label> element.
        { assert: "either", depth: 3 },
      ],
    },
  },
];

export default eslintConfig;
