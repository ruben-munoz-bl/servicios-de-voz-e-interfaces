/**
 * Opción A del reto: Web Speech API nativa del navegador.
 * Gratuita, sin API key y en tiempo real. Solo existe en navegadores
 * (Platform.OS === 'web'); en nativo `soportado` queda en false.
 */

export type EstadoVoz = "detenida" | "escuchando" | "error" | "no-soportada";

export interface SpeechHandlers {
  onParcial: (texto: string) => void;
  onEstado: (estado: EstadoVoz, detalle?: string) => void;
}

interface ReconocimientoLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((ev: EventResultado) => void) | null;
  onerror: ((ev: EventoError) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

interface EventResultado {
  results: {
    length: number;
    [index: number]: { isFinal: boolean; 0: { transcript: string } };
  };
}

interface EventoError {
  error: string;
}

type ConstructorReconocimiento = new () => ReconocimientoLike;

const ERRORES_FATALES = new Set(["not-allowed", "service-not-allowed", "audio-capture"]);

export function constructorReconocimiento(): ConstructorReconocimiento | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as Record<string, ConstructorReconocimiento | undefined>;
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export class EscuchaEnVivo {
  readonly soportado: boolean;
  private rec: ReconocimientoLike | null = null;
  private quiereEscuchar = false;
  private reinicioPendiente: ReturnType<typeof setTimeout> | null = null;
  private textoFinal = "";
  private textoParcial = "";
  private readonly handlers: SpeechHandlers;

  constructor(handlers: SpeechHandlers) {
    this.handlers = handlers;
    this.soportado = constructorReconocimiento() !== null;
    // No se avisa desde el constructor para no provocar actualizaciones de
    // estado durante el render: el componente parte de `soportado`.
  }

  get texto(): string {
    return (this.textoFinal + " " + this.textoParcial).replace(/\s+/g, " ").trim();
  }

  get estadoQuerido(): boolean {
    return this.quiereEscuchar;
  }

  empezar(): void {
    if (!this.soportado || this.quiereEscuchar) return;
    this.quiereEscuchar = true;
    this.crear();
    this.arrancar();
  }

  parar(): void {
    this.quiereEscuchar = false;
    if (this.reinicioPendiente !== null) {
      clearTimeout(this.reinicioPendiente);
      this.reinicioPendiente = null;
    }
    try {
      this.rec?.stop();
    } catch {
      /* ya detenido */
    }
    this.rec = null;
    this.textoParcial = "";
    this.handlers.onEstado("detenida");
  }

  limpiar(): void {
    this.textoFinal = "";
    this.textoParcial = "";
    this.handlers.onParcial("");
  }

  fijarTexto(texto: string): void {
    this.textoFinal = texto;
    this.textoParcial = "";
    this.handlers.onParcial(texto);
  }

  private crear(): void {
    const Ctor = constructorReconocimiento();
    if (!Ctor) return;
    const rec = new Ctor();
    rec.lang = "es-ES";
    rec.continuous = true;
    rec.interimResults = true;

    rec.onresult = (ev) => {
      let parcial = "";
      for (let i = 0; i < ev.results.length; i++) {
        const resultado = ev.results[i];
        const cadena = resultado[0].transcript;
        if (resultado.isFinal) {
          this.textoFinal += " " + cadena;
        } else {
          parcial += cadena;
        }
      }
      this.textoParcial = parcial;
      this.handlers.onParcial(this.texto);
    };

    rec.onerror = (ev) => {
      if (ERRORES_FATALES.has(ev.error)) {
        this.quiereEscuchar = false;
        this.handlers.onEstado("error", ev.error);
      } else if (ev.error !== "no-speech" && ev.error !== "aborted") {
        this.handlers.onEstado("error", ev.error);
      }
    };

    rec.onend = () => {
      if (this.quiereEscuchar) {
        // El reconocedor se corta solo tras un periodo de silencio: se relanza.
        this.reinicioPendiente = setTimeout(() => {
          this.reinicioPendiente = null;
          this.arrancar();
        }, 250);
      }
    };

    this.rec = rec;
  }

  private arrancar(): void {
    if (!this.rec || !this.quiereEscuchar) return;
    try {
      this.rec.start();
      this.handlers.onEstado("escuchando");
    } catch {
      // start() lanza si ya estaba arrancando.
    }
  }
}
