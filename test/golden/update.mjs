import { writeFileSync } from "node:fs";
import { PCS, goldenFor, goldenUrl } from "./lib.mjs";
for (const id of PCS) { writeFileSync(goldenUrl(id), JSON.stringify(goldenFor(id), null, 1) + "\n"); console.log("wrote golden", id); }