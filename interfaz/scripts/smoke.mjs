/**
 * Prueba E2E de la interfaz React Native (Expo web) con Edge y micrófono simulado.
 *
 *   Terminal 1: uvicorn api.main:app --port 8000
 *   Terminal 2: cd interfaz && npm.cmd run web
 *   Terminal 3: cd interfaz && node scripts/smoke.mjs
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const URL = process.env.SMOKE_URL ?? "http://localhost:8081";
const WAV_DE_PRUEBA = join(tmpdir(), "stt-test", "audio-1.wav");
const SESIONES = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "results", "sesiones.json");

/** La prueba guarda una sesión sin transcripciones: se retira para no ensuciar el informe. */
function limpiarSesionesVacias() {
  if (!existsSync(SESIONES)) return;
  try {
    const datos = JSON.parse(readFileSync(SESIONES, "utf8"));
    const limpio = Object.fromEntries(
      Object.entries(datos).filter(
        ([, sesion]) => sesion.webspeech !== "" || sesion.gemini !== "",
      ),
    );
    if (Object.keys(limpio).length !== Object.keys(datos).length) {
      writeFileSync(SESIONES, JSON.stringify(limpio, null, 2));
      console.log("  [ok] sesión de prueba retirada de results/sesiones.json");
    }
  } catch (e) {
    console.log(`  [aviso] no se pudo limpiar sesiones: ${String(e)}`);
  }
}

const fallos = [];
const ok = (mensaje) => console.log(`  [ok] ${mensaje}`);
const mal = (mensaje) => {
  fallos.push(mensaje);
  console.log(`  [FALLO] ${mensaje}`);
};
const comprobar = (condicion, bien, malo) => (condicion ? ok(bien) : mal(malo));

const browser = await chromium.launch({
  channel: "msedge",
  headless: true,
  args: [
    "--use-fake-device-for-media-stream",
    "--use-fake-ui-for-media-stream",
    "--autoplay-policy=no-user-gesture-required",
  ],
});

try {
  const contexto = await browser.newContext({ permissions: ["microphone"] });
  const pagina = await contexto.newPage();
  const errores = [];
  pagina.on("pageerror", (e) => errores.push(String(e)));
  pagina.on("console", (m) => {
    if (m.type() === "error") errores.push(m.text());
  });

  console.log(`Abriendo ${URL}`);
  await pagina.goto(URL, { waitUntil: "domcontentloaded", timeout: 90_000 });
  await pagina.waitForSelector('[data-testid="titulo"]', { timeout: 90_000 });
  ok("interfaz React Native (Expo web) cargada");

  const estadoApi = await pagina.locator('[data-testid="estado-api"]').innerText();
  comprobar(estadoApi.includes("conectada"), `endpoint: ${estadoApi}`, `endpoint: ${estadoApi}`);

  // ---- Reto 2 (DAM): prototipo móvil de grabación + transcripción ----
  const botonesFrase = await pagina.locator('[data-testid^="frase-audio-"]').count();
  comprobar(botonesFrase === 3, "3 frases seleccionables", `frases: ${botonesFrase}`);
  const frase = await pagina.locator('[data-testid="frase-audio-1"]').innerText();
  comprobar(frase.includes("audio-1"), `frase activa: ${frase}`, `frase: ${frase}`);

  // ---- Reto 1 · Opción A: Web Speech API ----
  const soportada = await pagina.evaluate(
    () => typeof (window.SpeechRecognition ?? window.webkitSpeechRecognition) === "function",
  );
  comprobar(
    soportada,
    "Web Speech API disponible (sin API key)",
    "Web Speech API NO disponible",
  );
  const estadoVoz = await pagina.locator('[data-testid="estado-voz"]').innerText();
  comprobar(
    estadoVoz !== "no-soportada",
    `estado de voz: ${estadoVoz}`,
    "la interfaz reporta Web Speech no soportada",
  );

  const pistas = await pagina.evaluate(async () => {
    const flujo = await navigator.mediaDevices.getUserMedia({ audio: true });
    const n = flujo.getAudioTracks().length;
    flujo.getTracks().forEach((t) => t.stop());
    return n;
  });
  comprobar(pistas > 0, `getUserMedia entrega ${pistas} pista(s)`, "getUserMedia sin pistas");

  // ---- Grabación con expo-audio (MediaRecorder en web) ----
  await pagina.click('[data-testid="btn-grabar"]');
  await pagina.waitForTimeout(2200);
  const grabando = await pagina.locator('[data-testid="estado-grabacion"]').innerText();
  comprobar(
    grabando.toLowerCase().includes("grabando"),
    `grabación en curso: ${grabando}`,
    `estado de grabación: ${grabando}`,
  );
  const reloj = await pagina.locator('[data-testid="temporizador"]').innerText();
  comprobar(reloj !== "00:00", `temporizador: ${reloj}`, "temporizador a 00:00");

  await pagina.click('[data-testid="btn-grabar"]');
  await pagina.waitForTimeout(900);
  const origen = await pagina.locator('[data-testid="origen-audio"]').innerText();
  comprobar(origen.includes("Audio grabado"), `audio grabado: ${origen}`, `origen: ${origen}`);

  const geminiHabilitado = !(await pagina.isDisabled('[data-testid="btn-gemini"]'));
  comprobar(
    geminiHabilitado,
    "botón «Enviar audio a Gemini» habilitado",
    "botón Gemini deshabilitado",
  );

  // ---- Segunda forma de aportar audio: subir un fichero ----
  if (existsSync(WAV_DE_PRUEBA)) {
    const [selector] = await Promise.all([
      pagina.waitForEvent("filechooser", { timeout: 15_000 }),
      pagina.click('[data-testid="btn-subir"]'),
    ]);
    await selector.setFiles(WAV_DE_PRUEBA);
    await pagina.waitForTimeout(600);
    const origenSubido = await pagina.locator('[data-testid="origen-audio"]').innerText();
    comprobar(
      origenSubido.includes("Archivo subido"),
      `fichero subido: ${origenSubido.split("\n")[0]}`,
      `subida fallida: ${origenSubido}`,
    );
  } else {
    mal(`no existe el WAV de prueba en ${WAV_DE_PRUEBA}`);
  }

  // ---- Guardar sesión contra el endpoint ----
  await pagina.click('[data-testid="btn-guardar"]');
  await pagina.waitForTimeout(800);
  const guardado = await pagina.locator('[data-testid="guardado"]').innerText();
  comprobar(
    guardado.includes("Sesión guardada"),
    `sesión: ${guardado}`,
    `guardado: ${guardado}`,
  );
  limpiarSesionesVacias();

  const relevantes = errores.filter(
    (e) => !e.includes("favicon") && !e.includes("Download the React DevTools") && !e.includes("Web Speech"),
  );
  comprobar(
    relevantes.length === 0,
    "sin errores de consola",
    `errores: ${relevantes.join(" | ")}`,
  );
} finally {
  await browser.close();
}

if (fallos.length) {
  console.log(`\n${fallos.length} comprobación(es) fallida(s)`);
  process.exit(1);
}
console.log("\nTodas las comprobaciones E2E han pasado");
