import fs from "fs";
import path from "path";

const uiDir = "client/src/components/ui";
const components = fs.readdirSync(uiDir).filter(f => f.endsWith(".tsx")).map(f => f.replace(".tsx", ""));

const srcDir = "client/src";
const allFiles: string[] = [];

function walk(dir: string) {
  for (const f of fs.readdirSync(dir)) {
    const fp = path.join(dir, f);
    if (fs.statSync(fp).isDirectory()) {
      walk(fp);
    } else if (fp.endsWith(".ts") || fp.endsWith(".tsx")) {
      allFiles.push(fp);
    }
  }
}
walk(srcDir);

const unused = [];
for (const comp of components) {
  let used = false;
  for (const file of allFiles) {
    // don't check a component against itself for self-imports (unless needed, but usually we just want external usages)
    if (file === path.join(uiDir, comp + ".tsx")) continue;
    const content = fs.readFileSync(file, "utf8");
    if (content.includes(`@/components/ui/${comp}`)) {
      used = true;
      break;
    }
  }
  if (!used) unused.push(comp);
}

console.log("Unused:", unused.join(", "));
