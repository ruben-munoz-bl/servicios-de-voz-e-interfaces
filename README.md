# Speech-to-Text · Prototipo de interfaz (DAM)

Prototipo funcional de **grabación y transcripción de voz** que cumple los dos retos del día:

- **Reto 1 · Speech-to-Text**: transcripción con **Web Speech API** (tiempo real, sin API key) y con **Gemini** (ficheros de audio por lotes), verificada con 3 audios de prueba en español.
- **Reto 2 · Interfaz (perfil DAM)**: aplicación **React Native con Expo** mobile-first con botón de grabación, subida de fichero, transcripción en pantalla y envío del audio a Gemini.

---

## Arquitectura de red

```text
┌──────────────────────────────────────────────────────────────┐
│  React Native (Expo)  http://localhost:8081  (versión web)   │
│                                                              │
│  expo-audio (MediaRecorder) ─► audio .webm                   │
│  expo-document-picker       ─► wav / mp3 / m4a / webm        │
│  webkitSpeechRecognition    ─► texto en tiempo real (es-ES)  │
└───────────────┬───────────────────────────────┬──────────────┘
                │ POST /transcribir             │ (sin servidor:
                │  multipart: audio + etiqueta  │  la Web Speech
                ▼                               │  habla directo
┌───────────────────────────────────┐           │  con el servicio
│  FastAPI  127.0.0.1:8000          │           │  de Microsoft)
│  api/main.py                      │           └──────────────►
│   · guarda el audio en audios/    │
│   · llama a Gemini con JSON       │
│   · POST /resultado guarda sesión │
└───────────────┬───────────────────┘
                │ HTTPS  (única llamada saliente a Internet)
                ▼
   generativelanguage.googleapis.com  ·  gemini-3.5-flash-lite
```

- El endpoint **solo escucha en localhost**: no abre puertos ni necesita privilegios.
- La Web Speech API no pasa por nuestro servidor: la transcribe el propio navegador.
- La misma app corre en **nativo** (Expo Go / desarrollo build); ahí la Web Speech no existe, así que la interfaz lo indica y se usa solo la columna de Gemini.
- Todo se instala en espacio de usuario (**sin permisos de administrador**).

---

## Requisitos previos

| Componente | Versión usada | Instalación |
|---|---|---|
| Python | 3.14 | ya instalada en el equipo |
| Node.js + npm | 24 / 11 | en `AppData\Local\nodejs` (uso con `npm.cmd`) |
| Navegador | Edge 154 (Chromium) | ya instalado |
| Micrófono | cualquiera | integrado del equipo |

---

## Instalación

```bash
# 1. Dependencias de la interfaz (React Native / Expo)
cd interfaz
npm.cmd install
cd ..

# 2. Entorno virtual de Python + dependencias del endpoint
python -m venv .venv
.venv\Scripts\python -m pip install -r api\requirements.txt

# 3. API key (solo local, nunca se sube a ningún repositorio)
copy .env.example .env        # y pegar GEMINI_API_KEY
```

---

## Uso

### Terminal 1 — endpoint Gemini

```bash
.venv\Scripts\uvicorn api.main:app --host 127.0.0.1 --port 8000
```

### Terminal 2 — interfaz

```bash
cd interfaz
npm.cmd run web       # Metro + versión web → http://localhost:8081
npm.cmd run start     # servidor Expo (opción nativa / Expo Go)
```

### Reto 1 · Grabar los 3 audios de prueba

1. En la interfaz, elige la frase `audio-1` (las tres están en `audios/esperado.json`, que es la **verdad de oro**).
2. Pulsa **Grabar**, lee la frase en voz alta y pulsa **Detener**.
   - Mientras hablas se ve la transcripción **en tiempo real** (Web Speech API).
   - El audio queda capturado con `expo-audio` (MediaRecorder en web).
3. Pulsa **Enviar audio a Gemini**: el fichero viaja al endpoint, se guarda en `audios/audio-1.webm` y Gemini devuelve la transcripción en JSON.
4. Pulsa **Guardar sesión** (escribe `results/sesiones.json`).
5. Repite con `audio-2` y `audio-3`.

La interfaz muestra el progreso **«N/3 guardados»** y marca con ✓ las frases ya guardadas; las métricas de la última tarjeta indican las palabras transcritas por cada método.

> Alternativa: **Subir audio existente** (`.wav`, `.mp3`, `.m4a`, `.webm`) si ya tienes grabaciones.
> La Web Speech API solo transcribe el **micrófono en vivo**, así que para un fichero subido solo se obtendrá la transcripción de Gemini.

### Generar el informe comparativo

```bash
# Transcripción Gemini por lotes (opción B) — opcional si ya la hiciste desde la interfaz
.venv\Scripts\python scripts\gemini_stt.py

# Comparación Web Speech vs Gemini + informe
.venv\Scripts\python scripts\informe.py
```

Salidas: `results/informe.md` (tablas y conclusiones) y `results/informe.json` (datos en bruto).

---

## Estructura del proyecto

```text
.
├── interfaz/                  # app React Native (Expo SDK 57)
│   ├── App.tsx                # UI completa (testids para el E2E)
│   ├── src/
│   │   ├── voz.ts             # Web Speech API (es-ES, continuo, parcial)
│   │   ├── grabacion.ts       # expo-audio + expo-document-picker
│   │   ├── api.ts             # cliente HTTP del endpoint local
│   │   ├── tipos.ts           # tipos compartidos
│   │   └── estilos.ts         # StyleSheet
│   ├── scripts/smoke.mjs      # prueba E2E con Edge (micrófono simulado)
│   ├── scripts/captura.mjs    # capturas de pantalla de la interfaz
│   ├── eslint.config.js       # lint (expo lint)
│   └── app.json / tsconfig.json
├── api/
│   ├── main.py                # FastAPI: /health /frases /transcribir /resultado
│   ├── gemini_transcripcion.py  # prompt + modelo + JSON estructurado
│   └── requirements.txt
├── scripts/
│   ├── gemini_stt.py          # transcripción por lotes (Opción B)
│   └── informe.py             # WER + tablas + conclusiones
├── audios/
│   └── esperado.json           # 3 frases de referencia (verdad de oro)
│                               # los audios grabados se guardan aquí
├── results/                    # sesiones, informes y capturas de pantalla
└── .env                        # GEMINI_API_KEY (solo local)
```

---

## Métricas de verificación

| Métrica | Descripción |
|---|---|
| **WER** (*Word Error Rate*) | Edición mínima sobre tokens / nº de tokens de la referencia. 0% = perfecto, 100% = nada correcto |
| **Exactitud** | % de transcripciones idénticas a la referencia tras normalizar |
| **Victoria por audio** | Método con menor WER en cada uno de los 3 audios |

Normalización previa: minúsculas, sin tildes, sin puntuación y espacios simples.

### Ventajas y desventajas comparadas

| | Web Speech API | Gemini |
|---|---|---|
| **Ventajas** | Tiempo real · gratuita y sin API key · sin backend | Más precisa · acepta ficheros y lotes · salida JSON estructurada |
| **Desventajas** | Solo navegador Chromium · solo micrófono en vivo · cortes por silencio | No es tiempo real · necesita API key + endpoint + red · coste por tokens |

---

## Decisiones de stack

Se evaluó el PC de desarrollo **sin permisos de administrador** y sin emulador Android:

| Opción | Decisión | Motivo |
|---|---|---|
| **React Native (Expo)** | ✅ elegida | Petición explícita: misma app para móvil y web con un solo código; se prueba aquí en la versión web (Metro :8081) y admite desarrollo en Expo Go |
| PWA con Vite + TypeScript | probada y retirada | Primer prototipo (E2E 12/12), sustituido por React Native según la petición final |
| Ionic + Capacitor | descartada | Capacitor exige Android Studio para el APK |
| Flutter | descartada | ~1,5 GB de SDK y emulador Android (virtualización) |
| .NET MAUI | descartada | Requiere Visual Studio con workloads (admin) |

---

## Verificación automatizada

```bash
cd interfaz
npm.cmd exec -- tsc --noEmit        # tipos (strict)
npm.cmd exec -- expo lint           # lint
npm.cmd exec -- expo-doctor         # diagnóstico de dependencias
npm.cmd run web                     # en una terminal (uvicorn debe estar arrancado)
node scripts\smoke.mjs              # en otra: prueba E2E (15 comprobaciones)
node scripts\captura.mjs            # capturas → results/captura.png y captura-final.png
```

`interfaz/scripts/smoke.mjs` abre **Edge** con micrófono simulado y comprueba: carga de la UI en Expo web, endpoint conectado, 3 frases, `webkitSpeechRecognition`, `getUserMedia`, grabación completa con temporizador, subida de fichero, guardado de sesión y ausencia de errores de consola. La sesión creada por la prueba se retira al terminar, así que `results/sesiones.json` solo contienen tus grabaciones reales.

---

## Solución de problemas

| Síntoma | Causa / solución |
|---|---|
| «Web Speech API: network» o «not-allowed» | El navegador pide permiso de micrófono o la red corporativa bloquea el servicio de reconocimiento; Gemini sigue funcionando |
| «API local: sin conexión» | Arranca uvicorn en el puerto 8000 |
| Puerto 8081 ocupado | `netstat -ano | findstr 8081` y cierra el proceso Metro anterior |
| Error 499/415 al enviar el audio | Formato no admitido: usa `.wav`, `.mp3`, `.m4a` o `.webm` |
| Faltan datos en el informe | Graba los 3 audios y pulsa *Guardar sesión*, o ejecuta `scripts/gemini_stt.py` |

---

## Seguridad de la API Key

- La clave vive **solo** en `.env` (incluido en `.gitignore`).
- Nunca se introduce en el código ni en el navegador: el navegador solo habla con `127.0.0.1:8000`.
