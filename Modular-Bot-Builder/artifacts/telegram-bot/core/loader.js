import { readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MODULES_DIR = join(__dirname, "..", "modules");

export async function loadModules(bot) {
  const files = readdirSync(MODULES_DIR)
    .filter((file) => file.endsWith(".js"))
    .sort();

  console.log(`[loader] Found ${files.length} module(s)`);

  for (const file of files) {
    const modulePath = pathToFileURL(join(MODULES_DIR, file)).href;
    const mod = await import(modulePath);

    if (typeof mod.setup === "function") {
      await mod.setup(bot);
      console.log(`[loader] Module loaded: ${file}`);
    } else {
      console.warn(`[loader] Module ${file} does not export setup(bot), skipping`);
    }
  }

  console.log("[loader] All modules loaded");
}
