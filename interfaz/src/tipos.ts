export interface Frase {
  clave: string;
  frase: string;
}

export interface RespuestaTranscripcion {
  etiqueta: string;
  texto: string;
  idioma: string;
  modelo: string;
  bytes: number;
  mime: string;
  guardado: string | null;
  segundos: number;
}

export interface Sesion {
  etiqueta: string;
  frase: string;
  audio: string | null;
  webspeech: string;
  gemini: string;
}

export interface RespuestaApi {
  ok: boolean;
  modelo?: string;
  detalle?: string;
}

export type FuenteAudio = { clase: "blob"; blob: Blob } | { clase: "uri"; uri: string; tipo: string };

export interface AudioGrabado {
  uri: string;
  nombre: string;
  segundos: number;
  fuente: FuenteAudio;
}
