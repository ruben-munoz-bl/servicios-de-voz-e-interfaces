import { useCallback, useEffect, useRef, useState } from "react";
import { Platform } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import { RecordingPresets, requestRecordingPermissionsAsync, useAudioRecorder } from "expo-audio";
import type { AudioGrabado, FuenteAudio } from "./tipos";

function extensionDe(nombre: string): string {
  const partes = (nombre.split("?")[0] ?? "").split(".");
  return partes.length > 1 ? (partes.pop() ?? "").toLowerCase() : "";
}

export function formatearTiempo(segundos: number): string {
  const m = Math.floor(segundos / 60).toString().padStart(2, "0");
  const s = (segundos % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

async function aFuente(uri: string, nombre: string, tipoPorDefecto: string): Promise<FuenteAudio> {
  if (Platform.OS === "web") {
    const respuesta = await fetch(uri);
    const blob = await respuesta.blob();
    return { clase: "blob", blob };
  }
  return { clase: "uri", uri, tipo: tipoPorDefecto };
}

/**
 * Grabación de micrófono cross-platform con expo-audio
 * (en web usa MediaRecorder por debajo; en nativo, el grabador del sistema).
 */
export function useGrabador() {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [grabando, setGrabando] = useState(false);
  const [segundos, setSegundos] = useState(0);
  const inicio = useRef(0);
  const reloj = useRef<ReturnType<typeof setInterval> | null>(null);

  const pararReloj = useCallback(() => {
    if (reloj.current !== null) {
      clearInterval(reloj.current);
      reloj.current = null;
    }
  }, []);

  useEffect(() => () => pararReloj(), [pararReloj]);

  const empezar = useCallback(async () => {
    const permiso = await requestRecordingPermissionsAsync();
    if (!permiso.granted) {
      throw new Error("Permiso de micrófono denegado");
    }
    await recorder.prepareToRecordAsync();
    recorder.record();
    inicio.current = Date.now();
    setSegundos(0);
    setGrabando(true);
    pararReloj();
    reloj.current = setInterval(() => {
      setSegundos(Math.round((Date.now() - inicio.current) / 1000));
    }, 300);
  }, [pararReloj, recorder]);

  const parar = useCallback(
    async (etiqueta: string): Promise<AudioGrabado | null> => {
      pararReloj();
      if (!grabando) return null;
      await recorder.stop();
      setGrabando(false);
      const uri = recorder.uri;
      if (!uri) return null;
      const ext = extensionDe(uri) || (Platform.OS === "web" ? "webm" : "m4a");
      const nombre = `${etiqueta}.${ext}`;
      const tipo = Platform.OS === "web" ? "audio/webm" : "audio/mp4";
      const transcurridos = Math.round((Date.now() - inicio.current) / 1000);
      setSegundos(transcurridos);
      return { uri, nombre, segundos: transcurridos, fuente: await aFuente(uri, nombre, tipo) };
    },
    [grabando, pararReloj, recorder],
  );

  return { grabando, segundos, empezar, parar };
}

/** Selector de fichero de audio ya grabado (segunda forma de aportar audio). */
export async function subirAudio(etiqueta: string): Promise<AudioGrabado | null> {
  const resultado = await DocumentPicker.getDocumentAsync({
    type: ["audio/*", "audio/wav", "audio/mpeg", "audio/mp4", "audio/x-m4a", "audio/webm", "audio/ogg"],
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (resultado.canceled || !resultado.assets || resultado.assets.length === 0) return null;
  const fichero = resultado.assets[0];
  const ext = extensionDe(fichero.name) || extensionDe(fichero.uri) || "wav";
  const nombre = `${etiqueta}.${ext}`;
  const tipo = fichero.mimeType ?? (Platform.OS === "web" ? "audio/webm" : "audio/mp4");
  return {
    uri: fichero.uri,
    nombre,
    segundos: 0,
    fuente: await aFuente(fichero.uri, nombre, tipo),
  };
}
