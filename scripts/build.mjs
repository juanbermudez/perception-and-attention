// Bundles the app into one self-contained HTML file: dist/index.html.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { build } from "esbuild";

const result = await build({
  entryPoints: ["src/main.ts"],
  bundle: true,
  minify: true,
  write: false,
  format: "esm",
  target: "es2022",
  legalComments: "inline",
});
const template = await readFile("src/index.html", "utf8");
const css = await readFile("src/styles.css", "utf8");
const script = result.outputFiles[0].text.replaceAll("</script", "<\\/script");
const html = template.replace("/* STYLES */", () => css).replace("/* SCRIPT */", () => script);
await mkdir("dist", { recursive: true });
await writeFile("dist/index.html", html);
console.log(`Built dist/index.html (${(html.length / 1024).toFixed(0)} KiB)`);
