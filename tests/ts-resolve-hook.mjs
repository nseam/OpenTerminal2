// Node's built-in TypeScript support strips types but does not resolve extensionless
// relative imports, which is how the application sources import each other. This hook
// retries a failed relative resolution with a `.ts` extension appended.
import { registerHooks } from "node:module";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

registerHooks({
    resolve(specifier, context, nextResolve) {
        try {
            return nextResolve(specifier, context);
        } catch (error) {
            if (specifier.startsWith(".") && context.parentURL) {
                const candidate = new URL(`${specifier}.ts`, context.parentURL);

                if (existsSync(fileURLToPath(candidate))) {
                    return { url: candidate.href, shortCircuit: true };
                }
            }

            throw error;
        }
    },
});
