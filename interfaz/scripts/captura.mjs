/** Captura de pantalla de la interfaz: node scripts\captura.mjs [salida.png] */
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const url = process.env.SMOKE_URL ?? "http://localhost:8081";
const salida =
  process.argv[2] ??
  resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "results", "captura.png");

const browser = await chromium.launch({ channel: "msedge", headless: true });
try {
  const pagina = await browser.newPage({ viewport: { width: 420, height: 940 }, deviceScaleFactor: 2 });
  await pagina.goto(url, { waitUntil: "domcontentloaded", timeout: 90_000 });
  await pagina.waitForSelector('[data-testid="titulo"]', { timeout: 90_000 });
  await pagina.waitForTimeout(2500);
  await pagina.screenshot({ path: salida });
  await pagina.evaluate(() => {
    const contenedor = [...document.querySelectorAll("div")].find(
      (n) => n.scrollHeight > n.clientHeight + 50,
    );
    if (contenedor) contenedor.scrollTop = contenedor.scrollHeight;
  });
  await pagina.waitForTimeout(600);
  await pagina.screenshot({ path: salida.replace(/\.png$/, "-final.png") });
  console.log(`captura escrita en ${salida}`);
} finally {
  await browser.close();
}
