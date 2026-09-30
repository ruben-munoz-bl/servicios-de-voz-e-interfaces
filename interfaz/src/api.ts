import { Platform } from "react-native";
import type { FuenteAudio, RespuestaApi, RespuestaTranscripcion, Sesion } from "./tipos";

/**
 * Endpoint local (api/main.py). En web se usa 127.0.0.1; si se ejecuta en un
 * móvil, define EXPO_PUBLIC_API_URL con la IP de la PC (ej. http://192.168.1.50:8000).
 */
export const API_BASE =
  (typeof process !== "undefined" && process.env?.EXPO_PUBLIC_API_URL) ||
  (Platform.OS === "web" ? "http://127.0.0.1:8000" : "http://127.0.0.1:8000");

async function pedir<T>(ruta: string, init?: RequestInit): Promise<T> {
  let respuesta: Response;
  try {
    respuesta = await fetch(`${API_BASE}${ruta}`, init);
  } catch {
    throw new Error(`No responde el endpoint local (${API_BASE}). ¿Está uvicorn arrancado?`);
  }
  const datos = (await respuesta.json()) as T & { detalle?: string };
  if (!respuesta.ok) {
    throw new Error(datos.detalle ?? `Error ${respuesta.status} en ${ruta}`);
  }
  return datos;
}

export function comprobarApi(): Promise<RespuestaApi> {
  return pedir<RespuestaApi>("/health");
}

export function listarFrases(): Promise<{ frases: { clave: string; frase: string }[] }> {
  return pedir<{ frases: { clave: string; frase: string }[] }>("/frases");
}

export function guardarSesion(sesion: Sesion): Promise<{ guardado: string }> {
  return pedir<{ guardado: string }>("/resultado", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(sesion),
  });
}

export function transcribirAudio(etiqueta: string, fuente: FuenteAudio, nombre: string): Promise<RespuestaTranscripcion> {
  const form = new FormData();
  form.append("etiqueta", etiqueta);
  if (fuente.clase === "blob") {
    form.append("archivo", fuente.blob, nombre);
  } else {
    // React Native (iOS/Android) espera un descriptor { uri, name, type }
    (form as unknown as { append: (campo: string, dato: unknown) => void }).append("archivo", {
      uri: fuente.uri,
      name: nombre,
      type: fuente.tipo,
    });
  }
  return pedir<RespuestaTranscripcion>("/transcribir", { method: "POST", body: form });
}
