import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { StatusBar } from "expo-status-bar";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ActivityIndicator, Animated, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useAudioPlayer } from "expo-audio";
import { API_BASE, comprobarApi, guardarSesion, listarFrases, transcribirAudio } from "./src/api";
import estilos, { colores } from "./src/estilos";
import { formatearTiempo, subirAudio, useGrabador } from "./src/grabacion";
import type { AudioGrabado, Frase, Sesion } from "./src/tipos";
import { EscuchaEnVivo, constructorReconocimiento, type EstadoVoz } from "./src/voz";

const FRASES_FALLBACK: Frase[] = [
  { clave: "audio-1", frase: "Frase 1 (endpoint local desconectado)" },
  { clave: "audio-2", frase: "Frase 2 (endpoint local desconectado)" },
  { clave: "audio-3", frase: "Frase 3 (endpoint local desconectado)" },
];

type Tono = "neutro" | "ok" | "ko" | "acento";

function Pastilla({
  texto,
  tono = "neutro",
  testID,
}: {
  texto: string;
  tono?: Tono;
  testID?: string;
}) {
  const puntoColor =
    tono === "ok"
      ? colores.ok
      : tono === "ko"
        ? colores.ko
        : tono === "acento"
          ? colores.acento
          : colores.tenue;
  return (
    <View
      testID={testID}
      style={[
        estilos.pastilla,
        tono === "ok" && estilos.pastillaOk,
        tono === "ko" && estilos.pastillaKo,
        tono === "acento" && estilos.pastillaAcento,
      ]}
    >
      <View style={[estilos.punto, { backgroundColor: puntoColor }]} />
      <Text style={estilos.pastillaTexto}>{texto}</Text>
    </View>
  );
}

function Latido({ activo, color }: { activo: boolean; color: string }) {
  const [opacidad] = useState(() => new Animated.Value(1));
  useEffect(() => {
    if (!activo) {
      opacidad.setValue(1);
      return;
    }
    const animacion = Animated.loop(
      Animated.sequence([
        Animated.timing(opacidad, { toValue: 0.2, duration: 620, useNativeDriver: false }),
        Animated.timing(opacidad, { toValue: 1, duration: 620, useNativeDriver: false }),
      ]),
    );
    animacion.start();
    return () => animacion.stop();
  }, [activo, opacidad]);
  return <Animated.View style={[estilos.puntoGrande, { backgroundColor: color, opacity: opacidad }]} />;
}

function Seccion({
  paso,
  icono,
  titulo,
  aside,
  testID,
  children,
}: {
  paso: string;
  icono: keyof typeof Ionicons.glyphMap;
  titulo: string;
  aside?: ReactNode;
  testID?: string;
  children: ReactNode;
}) {
  return (
    <View style={estilos.tarjeta} testID={testID}>
      <View style={estilos.seccionCabecera}>
        <View style={estilos.paso}>
          <Text style={estilos.pasoTexto}>{paso}</Text>
        </View>
        <Ionicons name={icono} size={17} color={colores.acentoAlto} />
        <Text style={estilos.tituloTarjeta}>{titulo}</Text>
        {aside ? <View style={estilos.aside}>{aside}</View> : null}
      </View>
      {children}
    </View>
  );
}

function Boton({
  texto,
  onPress,
  icono,
  variante = "secundario",
  deshabilitado,
  cargando,
  testID,
}: {
  texto: string;
  onPress: () => void;
  icono?: keyof typeof Ionicons.glyphMap;
  variante?: "primario" | "secundario" | "peligro" | "fantasma";
  deshabilitado?: boolean;
  cargando?: boolean;
  testID?: string;
}) {
  const textoEstilo =
    variante === "primario"
      ? estilos.botonPrimarioTexto
      : variante === "peligro"
        ? estilos.botonPeligroTexto
        : variante === "fantasma"
          ? estilos.botonFantasmaTexto
          : estilos.botonTexto;
  const colorIcono =
    variante === "primario" ? "#06283D" : variante === "peligro" ? colores.blanco : colores.suave;
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={deshabilitado}
      accessibilityRole="button"
      style={({ pressed }) => [
        estilos.boton,
        variante === "primario" && estilos.botonPrimario,
        variante === "peligro" && estilos.botonPeligro,
        variante === "fantasma" && estilos.botonFantasma,
        deshabilitado && estilos.botonDeshabilitado,
        pressed && { opacity: 0.72 },
      ]}
    >
      {cargando ? (
        <ActivityIndicator size="small" color={colorIcono} />
      ) : icono ? (
        <Ionicons name={icono} size={16} color={colorIcono} />
      ) : null}
      <Text style={textoEstilo}>{texto}</Text>
    </Pressable>
  );
}

function Panel({ children }: { children: ReactNode }) {
  return (
    <View style={estilos.panel}>
      <View style={estilos.panelCabecera}>
        <Text style={estilos.etiqueta}>Salida</Text>
      </View>
      {children}
    </View>
  );
}

export default function App() {
  const [frases, setFrases] = useState<Frase[]>(FRASES_FALLBACK);
  const [seleccion, setSeleccion] = useState("audio-1");
  const [estadoApi, setEstadoApi] = useState<"comprobando" | "ok" | "ko">("comprobando");
  const [detalleApi, setDetalleApi] = useState("comprobando…");

  const [textoVivo, setTextoVivo] = useState("");
  const [errorVoz, setErrorVoz] = useState("");
  const soportado = useMemo(() => constructorReconocimiento() !== null, []);
  const [estadoVoz, setEstadoVoz] = useState<EstadoVoz>(soportado ? "detenida" : "no-soportada");
  const [editando, setEditando] = useState(false);
  const [textoManual, setTextoManual] = useState("");
  const [escucha] = useState(
    () =>
      new EscuchaEnVivo({
        onParcial: setTextoVivo,
        onEstado: (estado, detalle) => {
          setEstadoVoz(estado);
          setErrorVoz(detalle ?? "");
        },
      }),
  );

  const [audio, setAudio] = useState<AudioGrabado | null>(null);
  const [origen, setOrigen] = useState("Aún no hay audio: graba con el botón o sube un fichero.");
  const [textoGemini, setTextoGemini] = useState("Pendiente de envío.");
  const [geminiCrudo, setGeminiCrudo] = useState("");
  const [metaGemini, setMetaGemini] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [errorGemini, setErrorGemini] = useState("");
  const [guardado, setGuardado] = useState("");
  const [guardados, setGuardados] = useState<string[]>([]);

  const grabador = useGrabador();
  const reproductor = useAudioPlayer(audio?.uri);

  useEffect(() => () => escucha.parar(), [escucha]);

  useEffect(() => {
    listarFrases()
      .then((respuesta) => setFrases(respuesta.frases))
      .catch(() => setFrases(FRASES_FALLBACK));
    comprobarApi()
      .then((estado) => {
        setEstadoApi("ok");
        setDetalleApi(`conectada · modelo ${estado.modelo ?? "gemini"}`);
      })
      .catch((error: Error) => {
        setEstadoApi("ko");
        setDetalleApi(error.message);
      });
  }, []);

  const fraseActual = useMemo(
    () => frases.find((f) => f.clave === seleccion)?.frase ?? "",
    [frases, seleccion],
  );

  const sesionActual: Sesion = useMemo(
    () => ({
      etiqueta: seleccion,
      frase: fraseActual,
      audio: audio?.nombre ?? null,
      webspeech: escucha?.texto || textoVivo,
      gemini: geminiCrudo,
    }),
    [audio, escucha, fraseActual, geminiCrudo, seleccion, textoVivo],
  );

  const alternarGrabar = async () => {
    if (grabador.grabando) {
      const grabado = await grabador.parar(seleccion);
      escucha.parar();
      if (grabado) {
        setAudio(grabado);
        setOrigen(`Audio grabado: ${grabado.nombre} (${grabado.segundos} s).`);
        setTextoGemini("Pulsa «Enviar audio a Gemini».");
        setGeminiCrudo("");
        setMetaGemini("");
        setGuardado("");
      }
      return;
    }
    setErrorGemini("");
    setGuardado("");
    setAudio(null);
    setTextoGemini("Pendiente de envío.");
    setGeminiCrudo("");
    setMetaGemini("");
    escucha.limpiar();
    if (escucha.soportado) escucha.empezar();
    try {
      await grabador.empezar();
    } catch (error) {
      escucha.parar();
      setOrigen(`No se pudo acceder al micrófono: ${(error as Error).message}`);
    }
  };

  const manejarSubida = async () => {
    try {
      const subido = await subirAudio(seleccion);
      if (!subido) return;
      setAudio(subido);
      setOrigen(
        `Archivo subido: ${subido.nombre}. La Web Speech API solo transcribe el micrófono en vivo, así que la columna en vivo queda como esté.`,
      );
      setTextoGemini("Pulsa «Enviar audio a Gemini».");
      setGeminiCrudo("");
      setMetaGemini("");
      setGuardado("");
    } catch (error) {
      setOrigen(`Error al subir el fichero: ${(error as Error).message}`);
    }
  };

  const enviarAGemini = async () => {
    if (!audio) return;
    setEnviando(true);
    setErrorGemini("");
    setTextoGemini("Enviando a Gemini…");
    try {
      const respuesta = await transcribirAudio(seleccion, audio.fuente, audio.nombre);
      setTextoGemini(respuesta.texto || "(modelo devolvió texto vacío)");
      setGeminiCrudo(respuesta.texto);
      setMetaGemini(
        `${respuesta.modelo} · ${respuesta.segundos} s · ${respuesta.bytes} bytes · ${respuesta.guardado ?? "n/a"}`,
      );
    } catch (error) {
      setErrorGemini((error as Error).message);
      setTextoGemini("Error en la transcripción.");
    } finally {
      setEnviando(false);
    }
  };

  const guardar = async () => {
    try {
      const respuesta = await guardarSesion(sesionActual);
      setGuardado(`Sesión guardada en ${respuesta.guardado}`);
      setGuardados((prev) => (prev.includes(seleccion) ? prev : [...prev, seleccion]));
    } catch (error) {
      setGuardado(`No se pudo guardar: ${(error as Error).message}`);
    }
  };

  const limpiar = () => {
    setAudio(null);
    setTextoGemini("Pendiente de envío.");
    setGeminiCrudo("");
    setMetaGemini("");
    setGuardado("");
    setOrigen("Aún no hay audio: graba con el botón o sube un fichero.");
    escucha.limpiar();
  };

  const descargar = () => {
    if (Platform.OS !== "web" || audio?.fuente.clase !== "blob") return;
    const glob = globalThis as unknown as {
      URL?: { createObjectURL(b: Blob): string; revokeObjectURL(u: string): void };
      document?: {
        createElement(t: string): { href: string; download: string; click(): void };
      };
    };
    if (!glob.URL || !glob.document) return;
    const url = glob.URL.createObjectURL(audio.fuente.blob);
    const enlace = glob.document.createElement("a");
    enlace.href = url;
    enlace.download = audio.nombre;
    enlace.click();
    glob.URL.revokeObjectURL(url);
  };

  const aplicarManual = () => {
    escucha.fijarTexto(textoManual);
    setEditando(false);
  };

  const mostrandoVoz = estadoVoz !== "no-soportada";
  const escuchando = estadoVoz === "escuchando";
  const palabrasWs = (sesionActual.webspeech ?? "").trim().split(/\s+/).filter(Boolean).length;
  const palabrasGemini = geminiCrudo.trim().split(/\s+/).filter(Boolean).length;

  return (
    <ScrollView style={estilos.pantalla} contentContainerStyle={estilos.contenedor}>
      <StatusBar style="light" />

      <LinearGradient colors={colores.degradado} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={estilos.cabecera}>
        <View style={estilos.cabeceraFila}>
          <View style={estilos.logo}>
            <Ionicons name="mic" size={22} color={colores.blanco} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={estilos.titulo} testID="titulo">
              Speech-to-Text
            </Text>
            <Text style={estilos.subtitulo}>Prototipo React Native (Expo) · perfil DAM</Text>
          </View>
        </View>
        <View style={estilos.filaPastillas}>
          <Pastilla
            testID="estado-api"
            tono={estadoApi === "ok" ? "ok" : estadoApi === "ko" ? "ko" : "neutro"}
            texto={`API local: ${detalleApi}`}
          />
          <Pastilla texto={`Plataforma: ${Platform.OS}`} />
          <Pastilla tono={escuchando ? "ok" : "acento"} texto={`Voz: ${estadoVoz}`} />
        </View>
      </LinearGradient>

      <Seccion
        paso="0"
        icono="albums-outline"
        titulo="Frases de prueba y audio"
        aside={<Text style={estilos.asideTexto}>{guardados.length}/3 guardados</Text>}
        testID="tarjeta-frases"
      >
        <Text style={estilos.nota}>
          Elige la frase que vas a decir. Puedes{" "}
          <Text style={estilos.negrita}>grabar con el micrófono</Text> o{" "}
          <Text style={estilos.negrita}>subir un fichero</Text> ya grabado (.wav, .mp3, .m4a, .webm);
          en ambos casos el audio se guarda como{" "}
          <Text style={estilos.codigo}>audios/{seleccion}.*</Text>.
        </Text>
        <View style={estilos.botonesFrase}>
          {frases.map((frase) => (
            <Pressable
              key={frase.clave}
              testID={`frase-${frase.clave}`}
              onPress={() => setSeleccion(frase.clave)}
              accessibilityRole="button"
              style={({ pressed }) => [
                estilos.fraseBoton,
                seleccion === frase.clave && estilos.fraseBotonActiva,
                pressed && { opacity: 0.7 },
              ]}
            >
              <Text style={estilos.fraseBotonTexto}>{frase.clave}</Text>
              {guardados.includes(frase.clave) ? (
                <Ionicons name="checkmark-circle" size={15} color={colores.ok} />
              ) : null}
            </Pressable>
          ))}
        </View>
        <Text style={estilos.fraseTexto}>{fraseActual ? `«${fraseActual}»` : "Cargando frases…"}</Text>
        <View style={estilos.fila}>
          <Boton
            texto="Subir audio existente…"
            icono="cloud-upload-outline"
            onPress={manejarSubida}
            testID="btn-subir"
          />
        </View>
        <Text style={estilos.nota} testID="origen-audio">
          {origen}
        </Text>
      </Seccion>

      <Seccion
        paso="1"
        icono="radio-outline"
        titulo="Grabación"
        aside={grabador.grabando ? <Latido activo color={colores.grabando} /> : null}
        testID="tarjeta-grabacion"
      >
        <View style={estilos.filaCentrada}>
          <Boton
            texto={grabador.grabando ? "Detener" : "Grabar"}
            icono={grabador.grabando ? "stop" : "mic"}
            variante={grabador.grabando ? "peligro" : "primario"}
            onPress={alternarGrabar}
            testID="btn-grabar"
          />
          <View style={estilos.cronChip}>
            <Ionicons name="time-outline" size={16} color={colores.suave} />
            <Text style={estilos.temporizador} testID="temporizador">
              {formatearTiempo(grabador.segundos)}
            </Text>
          </View>
        </View>
        <Text style={estilos.nota} testID="estado-grabacion">
          {grabador.grabando ? "Grabando y escuchando en vivo…" : "Pulsa para empezar a grabar."}
        </Text>
        {audio && (
          <View style={estilos.fila}>
            <Boton
              texto="Reproducir"
              icono="play-outline"
              onPress={() => {
                reproductor?.seekTo(0);
                reproductor?.play();
              }}
              testID="btn-reproducir"
            />
            <Boton texto="Parar" icono="pause-outline" onPress={() => reproductor?.pause()} />
            <Boton texto="Descargar" icono="download-outline" onPress={descargar} />
            <Boton texto="Limpiar" icono="trash-outline" onPress={limpiar} testID="btn-limpiar" />
          </View>
        )}
      </Seccion>

      <Seccion
        paso="2"
        icono="pulse-outline"
        titulo="Transcripción en tiempo real"
        aside={<Text style={estilos.asideTexto}>Web Speech · es-ES</Text>}
        testID="tarjeta-voz"
      >
        <View style={estilos.fila}>
          <Pastilla testID="estado-voz" texto={estadoVoz} tono={escuchando ? "ok" : "neutro"} />
          {escuchando ? <Latido activo color={colores.ok} /> : null}
          <Text style={estilos.nota}>sin API key · solo navegador</Text>
        </View>
        {mostrandoVoz ? (
          editando ? (
            <TextInput
              style={estilos.entrada}
              multiline
              value={textoManual}
              onChangeText={setTextoManual}
              placeholder="Escribe o corrige la transcripción…"
              placeholderTextColor={colores.tenue}
              testID="entrada-manual"
            />
          ) : (
            <Panel>
              <Text style={estilos.panelTexto} testID="texto-vivo">
                {textoVivo ? (
                  escuchando ? (
                    <>
                      {textoVivo}
                      <Text style={estilos.cursor}>▍</Text>
                    </>
                  ) : (
                    textoVivo
                  )
                ) : (
                  <Text style={estilos.parcial}>Aquí aparecerá la transcripción mientras hablas…</Text>
                )}
              </Text>
            </Panel>
          )
        ) : (
          <Text style={estilos.nota}>
            La Web Speech API solo existe en navegador: en nativo la transcripción en vivo no está
            disponible (se usa el endpoint de Gemini).
          </Text>
        )}
        <View style={estilos.fila}>
          <Boton
            texto={escuchando ? "Detener escucha" : "Iniciar escucha"}
            icono={escuchando ? "square-outline" : "ear-outline"}
            onPress={() => (escucha?.estadoQuerido ? escucha.parar() : escucha?.empezar())}
            deshabilitado={!mostrandoVoz}
            testID="btn-escucha"
          />
          {editando ? (
            <Boton texto="Aplicar" icono="checkmark-outline" onPress={aplicarManual} variante="primario" testID="btn-aplicar" />
          ) : (
            <Boton
              texto="Transcripción manual…"
              icono="create-outline"
              onPress={() => {
                setTextoManual(escucha?.texto ?? "");
                setEditando(true);
              }}
              deshabilitado={!mostrandoVoz}
              testID="btn-manual"
            />
          )}
        </View>
        {errorVoz ? <Text style={estilos.error} testID="error-voz">{`Web Speech API: ${errorVoz}`}</Text> : null}
      </Seccion>

      <Seccion
        paso="3"
        icono="sparkles-outline"
        titulo="Transcripción por lotes · Gemini"
        aside={<Text style={estilos.asideTexto}>{API_BASE.replace("http://", "")}</Text>}
        testID="tarjeta-gemini"
      >
        <Text style={estilos.nota}>
          El audio se envía al endpoint FastAPI, que lo reenvía al modelo Gemini y devuelve el texto
          en JSON.
        </Text>
        <View style={estilos.fila}>
          <Boton
            texto={enviando ? "Enviando…" : "Enviar audio a Gemini"}
            icono="send-outline"
            onPress={enviarAGemini}
            deshabilitado={!audio || enviando}
            cargando={enviando}
            variante="primario"
            testID="btn-gemini"
          />
          {metaGemini ? <Pastilla texto={metaGemini} tono="acento" /> : null}
        </View>
        <Panel>
          <Text style={estilos.panelTexto} testID="texto-gemini">
            {textoGemini}
          </Text>
        </Panel>
        {errorGemini ? <Text style={estilos.error} testID="error-gemini">{errorGemini}</Text> : null}
      </Seccion>

      <Seccion paso="4" icono="save-outline" titulo="Guardar sesión (para el informe)" testID="tarjeta-guardar">
        <Text style={estilos.nota}>
          Guarda Web Speech + Gemini asociados a la etiqueta seleccionada en results/sesiones.json,
          de donde lee scripts/informe.py.
        </Text>
        <View style={estilos.metricas}>
          <View style={estilos.metrica}>
            <Text style={estilos.metricaValor}>{palabrasWs}</Text>
            <Text style={estilos.metricaEtiqueta}>palabras · web speech</Text>
          </View>
          <View style={estilos.metrica}>
            <Text style={estilos.metricaValor}>{palabrasGemini}</Text>
            <Text style={estilos.metricaEtiqueta}>palabras · gemini</Text>
          </View>
          <View style={estilos.metrica}>
            <Text style={estilos.metricaValor}>{guardados.length}/3</Text>
            <Text style={estilos.metricaEtiqueta}>sesiones guardadas</Text>
          </View>
        </View>
        <View style={estilos.fila}>
          <Boton texto="Guardar sesión" icono="save-outline" onPress={guardar} variante="primario" testID="btn-guardar" />
        </View>
        {guardado ? (
          <Text style={guardado.includes("Sesión guardada") ? estilos.exito : estilos.error} testID="guardado">
            {guardado}
          </Text>
        ) : null}
        <Text style={estilos.resumen} testID="resumen">
          {JSON.stringify(sesionActual)}
        </Text>
      </Seccion>

      <Text style={estilos.pie}>
        Ejecución local: uvicorn api.main:app ·8000 (endpoint Gemini) y npm.cmd run web (interfaz).
        Fuente de voz: {Platform.OS}.
      </Text>
    </ScrollView>
  );
}
