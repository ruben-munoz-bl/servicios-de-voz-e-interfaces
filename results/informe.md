# Informe de verificación · Speech-to-Text con Gemini

Comparación de los **dos métodos** solicitados sobre los audios de prueba en español: **Web Speech API** (tiempo real, navegador) y **Gemini** (procesamiento por lotes).

## 1. Metodología

- Referencia (verdad de oro): `audios/esperado.json`.
- Métrica: **WER** (*Word Error Rate*) calculado sobre tokens; 0% es perfecto y 100% es total.
- Normalización previa: minúsculas, sin tildes, sin puntuación y espacios simples.
- *Exacto*: la transcripción normalizada coincide al 100% con la referencia.
- Fuentes: Web Speech → `results/sesiones.json`; Gemini → `results/gemini.json`.

## 2. Resultado por audio

| Audio | Tipo | WER Web Speech | WER Gemini | Exacto WS | Exacto Gemini | Ganador |
|---|---|---|---|---|---|---|
| audio-1 | noticia | — | — | no | no | pendiente |
| audio-2 | reseña | — | — | no | no | pendiente |
| audio-3 | email | — | — | no | no | pendiente |

## 3. Resumen por método

| Método | Audios evaluados | WER medio | Exactitud | Cobertura |
|---|---|---|---|---|
| Web Speech API | 0 | — | — | 0/3 |
| Gemini | 0 | — | — | 0/3 |

## 4. Transcripciones obtenidas

### audio-1 (noticia)

- **Referencia**: El ayuntamiento de Valencia inauguró hoy la nueva línea de metro con servicios gratuitos durante todo el fin de semana.

- **Web Speech API**: _(sin datos: graba el audio y guarda la sesión)_

- **Gemini**: _(sin datos: ejecuta scripts/gemini_stt.py)_


### audio-2 (reseña)

- **Referencia**: La reserva del restaurante fue un desastre porque tardaron más de una hora en servir y el pescado llegó frío.

- **Web Speech API**: _(sin datos: graba el audio y guarda la sesión)_

- **Gemini**: _(sin datos: ejecuta scripts/gemini_stt.py)_


### audio-3 (email)

- **Referencia**: Hola Marta te escribo para confirmar la reunión del jueves a las once de la mañana en la sala de juntas.

- **Web Speech API**: _(sin datos: graba el audio y guarda la sesión)_

- **Gemini**: _(sin datos: ejecuta scripts/gemini_stt.py)_


## 5. Ventajas y desventajas

| Método | Ventajas | Desventajas |
|---|---|---|
| **Web Speech API** | · Tiempo real (texto mientras hablas)<br>· Gratuita y sin API key; todo en el navegador<br>· Sin backend: no necesita servidor ni Python | · Transcribe solo micrófono en vivo: no admite ficheros<br>· Solo navegadores Chromium; calidad variable y cortes por silencio<br>· Depende de la red del navegador y no devuelve JSON estructurado |
| **Gemini** | · Más precisa con ruido, acentos y audios largos<br>· Acepta ficheros (.wav, .mp3, .m4a, .webm) y por tanto lotes<br>· Salida JSON estructurada y reutilizable | · No es tiempo real: hay que grabar y luego enviar<br>· Requiere API key, endpoint local y llamada a Google<br>· Latencia de red y coste por tokens (nivel gratuito limitado) |

## 6. Conclusiones

- **Faltan datos**: todavía no hay transcripciones de los dos métodos.
  1. Graba (o sube) los tres audios en la interfaz y pulsa *Guardar sesión*.
  2. Ejecuta `.venv\Scripts\python scripts\gemini_stt.py` (o envía cada audio desde la interfaz).
  3. Vuelve a ejecutar `python scripts\informe.py`.
