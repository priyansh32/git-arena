import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "vite";

async function main() {
  const rootDir = process.cwd();
  const distDir = resolve(rootDir, "dist");
  const ssrEntryPath = resolve(distDir, "server", "entry-static-pages-server.js");
  const staticRoutes = ["/"];

  // 1) Build client bundle with Vite
  await build({
    root: rootDir,
    build: {
      outDir: "dist",
      emptyOutDir: true
    }
  });

  // 2) Build SSR renderer bundle with Vite
  await build({
    root: rootDir,
    build: {
      ssr: resolve(rootDir, "src/prerender/entry-static-pages-server.tsx"),
      outDir: "dist/server",
      emptyOutDir: false
    }
  });

  // 3) Render known static route(s) to HTML
  const template = await readFile(resolve(distDir, "index.html"), "utf8");
  const ssrModule = await import(pathToFileURL(ssrEntryPath).href);

  if (typeof ssrModule.renderRoute !== "function") {
    throw new Error(
      `Expected renderRoute(routePath) export in ${ssrEntryPath}, but it was not found.`
    );
  }

  for (const routePath of staticRoutes) {
    const appHtml = ssrModule.renderRoute(routePath);
    const prerendered = template.replace(
      '<div id="root"></div>',
      `<div id="root">${appHtml}</div>`
    );

    const outputPath =
      routePath === "/"
        ? resolve(distDir, "index.html")
        : resolve(distDir, routePath.replace(/^\//, ""), "index.html");

    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, prerendered, "utf8");
  }

  console.log("Prerendered static routes via Vite SSR build API:", staticRoutes.join(", "));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
