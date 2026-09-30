"""Transcripción por lotes de audios/ con Gemini (Reto 1, Opción B).

Lee las claves de audios/esperado.json, busca audios/<clave>.<ext>, pide la
transcripción a Gemini y guarda results/gemini.json (mezclando lo que ya hubiera).

Uso:
    .venv\\Scripts\\python scripts\\gemini_stt.py              # todos
    .venv\\Scripts\\python scripts\\gemini_stt.py --etiqueta audio-2
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from api.gemini_transcripcion import EXTENSIONES, MODEL, nuevo_cliente, transcribir_audio  # noqa: E402

AUDIO_DIR = ROOT / "audios"
RESULTS_DIR = ROOT / "results"
ESPERADO_PATH = AUDIO_DIR / "esperado.json"
SALIDA_PATH = RESULTS_DIR / "gemini.json"


def main() -> int:
    parser = argparse.ArgumentParser(description="Transcribe audios/ con Gemini")
    parser.add_argument("--etiqueta", help="Solo esta clave (por ejemplo audio-1)")
    argumentos = parser.parse_args()

    if not ESPERADO_PATH.is_file():
        print(f"Falta {ESPERADO_PATH}", file=sys.stderr)
        return 1

    esperado = json.loads(ESPERADO_PATH.read_text(encoding="utf-8"))
    claves = [argumentos.etiqueta] if argumentos.etiqueta else list(esperado)

    cliente = nuevo_cliente()
    resultados: dict[str, dict] = {}
    errores = 0

    for clave in claves:
        candidatos = sorted(AUDIO_DIR.glob(f"{clave}.*"))
        fichero = next((c for c in candidatos if c.suffix.lower() in EXTENSIONES), None)
        if fichero is None:
            print(f"[aviso] {clave}: sin audio en audios/ (grába o súbelo en la interfaz)")
            continue
        try:
            texto, idioma, segundos = transcribir_audio(
                cliente, fichero.read_bytes(), EXTENSIONES[fichero.suffix.lower()]
            )
        except Exception as exc:  # noqa: BLE001
            print(f"[error] {clave}: {exc}", file=sys.stderr)
            errores += 1
            continue
        resultados[clave] = {
            "texto": texto,
            "idioma": idioma,
            "audio": fichero.name,
            "modelo": MODEL,
            "segundos": segundos,
        }
        print(f"[ok] {clave} ({fichero.name}, {segundos}s): {texto[:90]}")

    if resultados:
        RESULTS_DIR.mkdir(exist_ok=True)
        previo = {}
        if SALIDA_PATH.is_file():
            try:
                previo = json.loads(SALIDA_PATH.read_text(encoding="utf-8"))
            except json.JSONDecodeError:
                previo = {}
        previo.update(resultados)
        SALIDA_PATH.write_text(json.dumps(previo, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"\nGuardado en {SALIDA_PATH.relative_to(ROOT)}")
    else:
        print("\nNo se ha transcrito ningún audio.")

    return 1 if errores else 0


if __name__ == "__main__":
    raise SystemExit(main())
