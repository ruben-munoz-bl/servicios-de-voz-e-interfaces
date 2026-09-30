"""Endpoint local de transcripción de voz con Gemini.

Arquitectura de red (todo en el mismo equipo salvo la llamada a Google):

    navegador (PWA en 127.0.0.1:5173)
        │  POST /transcribir   multipart: audio + etiqueta
        ▼
    FastAPI en 127.0.0.1:8000  ←  este módulo (solo escucha en localhost)
        │  HTTPS a generativelanguage.googleapis.com
        ▼
    API de Gemini (gemini-3.5-flash-lite)

Arranque:  .venv\\Scripts\\uvicorn api.main:app --port 8000 --reload
"""

from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from pathlib import Path

from api.gemini_transcripcion import (
    API_KEY,
    EXTENSIONES,
    MODEL,
    nuevo_cliente,
    transcribir_audio,
)
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

BASE_DIR = Path(__file__).resolve().parent.parent

AUDIO_DIR = BASE_DIR / "audios"
RESULTS_DIR = BASE_DIR / "results"
ESPERADO_PATH = AUDIO_DIR / "esperado.json"
SESIONES_PATH = RESULTS_DIR / "sesiones.json"

ETIQUETA_RE = re.compile(r"^[A-Za-z0-9_-]{1,40}$")

app = FastAPI(title="Speech-to-Text DAM", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    # Orígenes de la interfaz (Expo web) — solo localhost, la API nunca se expone
    allow_origins=[
        "http://localhost:8081",
        "http://127.0.0.1:8081",
        "http://localhost:8082",
        "http://127.0.0.1:8082",
        "http://localhost:19006",
        "http://127.0.0.1:19006",
    ],
    allow_methods=["*"],
    allow_headers=["*"],
)


class Frase(BaseModel):
    clave: str
    frase: str


class RespuestaTranscripcion(BaseModel):
    etiqueta: str
    texto: str
    idioma: str
    modelo: str
    bytes: int
    mime: str
    guardado: str | None = None
    segundos: float


class Sesion(BaseModel):
    etiqueta: str
    frase: str = ""
    audio: str | None = None
    webspeech: str = ""
    gemini: str = ""


class Salud(BaseModel):
    ok: bool
    modelo: str
    api_key: bool
    audio_dir: bool


@app.get("/health", response_model=Salud)
def salud() -> Salud:
    return Salud(ok=True, modelo=MODEL, api_key=bool(API_KEY), audio_dir=AUDIO_DIR.is_dir())


@app.get("/frases", response_model=dict[str, list[Frase]])
def frases() -> dict[str, list[Frase]]:
    if not ESPERADO_PATH.is_file():
        raise HTTPException(status_code=404, detail=f"No existe {ESPERADO_PATH.name}")
    datos = json.loads(ESPERADO_PATH.read_text(encoding="utf-8"))
    return {"frases": [Frase(clave=clave, frase=valor["frase"]) for clave, valor in datos.items()]}


@app.post("/transcribir", response_model=RespuestaTranscripcion)
async def transcribir(etiqueta: str = Form(...), archivo: UploadFile = File(...)) -> RespuestaTranscripcion:
    if not ETIQUETA_RE.match(etiqueta):
        raise HTTPException(status_code=400, detail="Etiqueta inválida (usa solo letras, números, - y _)")

    nombre = archivo.filename or "audio"
    extension = Path(nombre).suffix.lower()
    if extension not in EXTENSIONES:
        extension = next((e for e in EXTENSIONES if nombre.lower().endswith(e)), "")
    if not extension:
        raise HTTPException(status_code=415, detail=f"Formato no admitido: {nombre}")

    datos = await archivo.read()
    if not datos:
        raise HTTPException(status_code=400, detail="El archivo está vacío")
    if len(datos) > 19 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="El audio supera los 19 MB del envío en línea")

    mime = EXTENSIONES[extension]
    AUDIO_DIR.mkdir(exist_ok=True)
    for viejo in AUDIO_DIR.glob(f"{etiqueta}.*"):
        viejo.unlink()
    destino = AUDIO_DIR / f"{etiqueta}{extension}"
    destino.write_bytes(datos)

    try:
        cliente = nuevo_cliente()
        texto, idioma, duracion = transcribir_audio(cliente, datos, mime)
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001 - se traduce a error HTTP legible
        raise HTTPException(status_code=502, detail=f"Error de la API de Gemini: {exc}") from exc

    return RespuestaTranscripcion(
        etiqueta=etiqueta,
        texto=texto,
        idioma=idioma,
        modelo=MODEL,
        bytes=len(datos),
        mime=mime,
        guardado=str(destino.relative_to(BASE_DIR)),
        segundos=duracion,
    )


@app.post("/resultado")
def guardar_resultado(sesion: Sesion) -> dict:
    if not ETIQUETA_RE.match(sesion.etiqueta):
        raise HTTPException(status_code=400, detail="Etiqueta inválida")
    RESULTS_DIR.mkdir(exist_ok=True)
    sesiones = _leer_json(SESIONES_PATH)
    registro = sesion.model_dump()
    registro["timestamp"] = datetime.now(timezone.utc).isoformat(timespec="seconds")
    sesiones[sesion.etiqueta] = registro
    SESIONES_PATH.write_text(json.dumps(sesiones, ensure_ascii=False, indent=2), encoding="utf-8")
    return {"guardado": str(SESIONES_PATH.relative_to(BASE_DIR)), "sesion": registro}


def _leer_json(ruta: Path) -> dict:
    if not ruta.is_file():
        return {}
    try:
        datos = json.loads(ruta.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {}
    return datos if isinstance(datos, dict) else {}
