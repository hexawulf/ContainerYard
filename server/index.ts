import { createApp } from "./src/index";
import { log } from "./vite";

createApp().catch((error) => {
  log(`Fatal server error: ${(error as Error).message}`, "fatal");
  process.exit(1);
});
