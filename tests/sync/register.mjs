// Lets plain node run the TypeScript under src/ and tests/sync/ without a build step or any
// dependency: `node --import ./tests/sync/register.mjs --test "tests/sync/*.test.mjs"`.
//
// Node 22.18+ strips TypeScript types by itself. What it does not do is find a file that was
// imported without its extension (`./schema`) or through the `@/` alias, which is how the app's
// sources import each other. This hook does only that. A `.tsx` file is deliberately not loadable:
// the modules tested here must not depend on React or React Native.
import { registerHooks } from 'node:module';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

registerHooks({
  resolve(specifier, context, nextResolve) {
    const parent = context.parentURL?.startsWith('file:') ? fileURLToPath(context.parentURL) : '';
    if (![path.join(root, 'src') + path.sep, path.join(root, 'tests') + path.sep].some(prefix => parent.startsWith(prefix))) {
      return nextResolve(specifier, context);
    }
    let target = null;
    if (specifier.startsWith('@/')) {
      target = path.join(root, 'src', specifier.slice(2));
    } else if ((specifier.startsWith('./') || specifier.startsWith('../')) && context.parentURL?.startsWith('file:')) {
      target = fileURLToPath(new URL(specifier, context.parentURL));
    }
    if (target && !existsSync(target)) {
      if (existsSync(`${target}.ts`)) target = `${target}.ts`;
      else if (existsSync(`${target}.tsx`)) throw new Error(`${specifier} is a .tsx module (React): it cannot be loaded in plain node. Imported from ${context.parentURL}`);
    }
    const result = nextResolve(target?.endsWith('.ts') ? pathToFileURL(target).href : specifier, context);
    // Say that it is an ES module, so node does not have to guess (the repo's package.json has no "type").
    return result.url.endsWith('.ts') ? { ...result, format: 'module-typescript' } : result;
  },
});


