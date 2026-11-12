// Regenerate assets/ui-sdk/ from the installed @ui-sdk/web package.
// Copies only the prebuilt browser runtime (web.js + web/). web.css is
// deliberately excluded: Cavesson styles its own components.
import { cp, rm, stat } from "node:fs/promises"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const src = join(root, "node_modules", "@ui-sdk", "web", "browser")
const dest = join(root, "assets", "ui-sdk")

await stat(join(src, "web.js"))
await rm(dest, { recursive: true, force: true })
await cp(join(src, "web.js"), join(dest, "web.js"))
await cp(join(src, "web"), join(dest, "web"), { recursive: true })
console.log("assets/ui-sdk/ regenerated from @ui-sdk/web")
