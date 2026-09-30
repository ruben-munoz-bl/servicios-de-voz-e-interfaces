"""Lógica compartida de transcripción con Gemini (endpoint y scripts por lotes)."""

from __future__ import annotations

import os
import time
from pathlib import Path

from dotenv import load_dotenv
from google import genai
from google.genai import types
from pydantic import BaseModel, Field

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env")

API_KEY = os.getenv("GEMINI_API_KEY", "").strip().strip('"')
MODEL = os.getenv("GEMINI_MODEL", "gemini-3.5-flash-lite")

PROMPT_TRANSCRIPCION = (
    "Eres un sistema de speech-to-text. Recibirás un archivo de audio con voz en español. "
    "Devuelve SOLO la transcripción literal del habla: sin comentarios, sin traducciones, "
    "sin marcas de tiempo y sin repetir el texto. "
    "Si no hay habla entendible, devuelve texto vacío. "
    "Responde en JSON con esta forma exacta: "
    '{"texto": "transcripción literal", "idioma": "es"}'
)


class ModeloTranscripcion(BaseModel):
    texto: str = Field(default="", description="Transcripción literal del habla")
    idioma: str = Field(default="es", description="Código de idioma")


EXTENSIONES = {
    ".webm": "audio/webm",
    ".mp3": "audio/mp3",
    ".wav": "audio/wav",
    ".m4a": "audio/mp4",
    ".mp4": "audio/mp4",
    ".ogg": "audio/ogg",
    ".oga": "audio/ogg",
    ".aac": "audio/aac",
    ".flac": "audio/flac",
}


def nuevo_cliente() -> genai.Client:
    if not API_KEY:
        raise RuntimeError("Falta GEMINI_API_KEY en el archivo .env")
    return genai.Client(api_key=API_KEY)


def transcribir_audio(cliente: genai.Client, datos: bytes, mime: str) -> tuple[str, str, float]:
    """Devuelve (texto, idioma, segundos_de_llamada)."""
    inicio = time.perf_counter()
    respuesta = cliente.models.generate_content(
        model=MODEL,
        contents=[PROMPT_TRANSCRIPCION, types.Part.from_bytes(data=datos, mime_type=mime)],
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
            response_schema=ModeloTranscripcion,
        ),
    )
    duracion = time.perf_counter() - inicio
    modelo = respuesta.parsed
    if isinstance(modelo, ModeloTranscripcion):
        return modelo.texto.strip(), modelo.idioma or "es", round(duracion, 2)
    texto = (respuesta.text or "").strip()
    return texto, "es", round(duracion, 2)
