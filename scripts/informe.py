"""Genera el informe comparando Web Speech API y Gemini (Reto 1: verificación).

Entradas:
    audios/esperado.json        frase de referencia (verdad de oro)
    results/sesiones.json       transcripción Web Speech guardada desde la interfaz
    results/gemini.json         transcripción Gemini (scripts/gemini_stt.py o la interfaz)

Salidas:
    results/informe.json        datos en bruto del informe
    results/informe.md          tabla comparativa + ventajas/desventajas + conclusiones

Uso:
    .venv\\Scripts\\python scripts\\informe.py
"""

from __future__ import annotations

import json
import re
import sys
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ESPERADO_PATH = ROOT / "audios" / "esperado.json"
SESIONES_PATH = ROOT / "results" / "sesiones.json"
GEMINI_PATH = ROOT / "results" / "gemini.json"
SALIDA_MD = ROOT / "results" / "informe.md"
SALIDA_JSON = ROOT / "results" / "informe.json"

PUNTUACION = re.compile(r"[^\w\sáéíóúüñ]", re.IGNORECASE)


def normalizar(texto: str) -> str:
    """Minúsculas, sin tildes, sin puntuación y con espacios simples."""
    bajo = unicodedata.normalize("NFD", (texto or "").lower())
    sin_tildes = "".join(c for c in bajo if unicodedata.category(c) != "Mn")
    limpio = PUNTUACION.sub(" ", sin_tildes)
    return re.sub(r"\s+", " ", limpio).strip()


def _distancia(tokens_a: list[str], tokens_b: list[str]) -> int:
    if len(tokens_a) < len(tokens_b):
        tokens_a, tokens_b = tokens_b, tokens_a
    previo = list(range(len(tokens_b) + 1))
    for i, cadena in enumerate(tokens_a, start=1):
        actual = [i]
        for j, otra in enumerate(tokens_b, start=1):
            actual.append(
                min(previo[j] + 1, actual[j - 1] + 1, previo[j - 1] + (cadena != otra))
            )
        previo = actual
    return previo[-1]


def wer(referencia: str, obtenido: str) -> float:
    """Word Error Rate (0 = perfecto, 1 = nada correcto)."""
    esp = normalizar(referencia).split()
    obt = normalizar(obtenido).split()
    if not esp:
        return 0.0 if not obt else 1.0
    return round(_distancia(esp, obt) / len(esp), 4)


def exacto(referencia: str, obtenido: str) -> bool:
    return bool(normalizar(referencia)) and normalizar(referencia) == normalizar(obtenido)


def _cargar(ruta: Path) -> dict:
    if not ruta.is_file():
        return {}
    try:
        datos = json.loads(ruta.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {}
    return datos if isinstance(datos, dict) else {}


def evaluar() -> dict:
    esperado = _cargar(ESPERADO_PATH)
    sesiones = _cargar(SESIONES_PATH)
    gemini = _cargar(GEMINI_PATH)

    filas = []
    for clave, meta in esperado.items():
        referencia = meta.get("frase", "")
        texto_ws = (sesiones.get(clave) or {}).get("webspeech", "").strip()
        texto_gm = (gemini.get(clave) or {}).get("texto") or (sesiones.get(clave) or {}).get("gemini", "").strip()

        ws = {
            "texto": texto_ws,
            "wer": wer(referencia, texto_ws) if texto_ws else None,
            "exacto": exacto(referencia, texto_ws) if texto_ws else False,
        }
        gm = {
            "texto": texto_gm,
            "wer": wer(referencia, texto_gm) if texto_gm else None,
            "exacto": exacto(referencia, texto_gm) if texto_gm else False,
        }

        if ws["wer"] is None or gm["wer"] is None:
            ganador = "pendiente"
        elif ws["wer"] == gm["wer"]:
            ganador = "empate"
        else:
            ganador = "Web Speech" if ws["wer"] < gm["wer"] else "Gemini"

        filas.append(
            {
                "clave": clave,
                "tipo": meta.get("tipo", ""),
                "referencia": referencia,
                "webspeech": ws,
                "gemini": gm,
                "ganador": ganador,
            }
        )

    resumen = {}
    for nombre, campo in (("Web Speech API", "webspeech"), ("Gemini", "gemini")):
        con_datos = [f[campo] for f in filas if f[campo]["wer"] is not None]
        resumen[nombre] = {
            "evaluados": len(con_datos),
            "wer_medio": round(sum(c["wer"] for c in con_datos) / len(con_datos), 4) if con_datos else None,
            "exactos": sum(1 for c in con_datos if c["exacto"]),
            "exactitud": round(sum(1 for c in con_datos if c["exacto"]) / len(con_datos), 4) if con_datos else None,
        }

    victorias = {}
    for f in filas:
        if f["ganador"] in ("Web Speech", "Gemini"):
            victorias[f["ganador"]] = victorias.get(f["ganador"], 0) + 1

    return {
        "filas": filas,
        "resumen": resumen,
        "victorias": victorias,
        "total_audios": len(filas),
        "fuentes": {
            "referencia": str(ESPERADO_PATH.relative_to(ROOT)),
            "webspeech": str(SESIONES_PATH.relative_to(ROOT)) if SESIONES_PATH.is_file() else None,
            "gemini": str(GEMINI_PATH.relative_to(ROOT)) if GEMINI_PATH.is_file() else None,
        },
    }


VENTAJAS = [
    (
        "Web Speech API",
        "Tiempo real (texto mientras hablas)",
        "Gratuita y sin API key; todo en el navegador",
        "Sin backend: no necesita servidor ni Python",
        "Transcribe solo micrófono en vivo: no admite ficheros",
        "Solo navegadores Chromium; calidad variable y cortes por silencio",
        "Depende de la red del navegador y no devuelve JSON estructurado",
    ),
    (
        "Gemini",
        "Más precisa con ruido, acentos y audios largos",
        "Acepta ficheros (.wav, .mp3, .m4a, .webm) y por tanto lotes",
        "Salida JSON estructurada y reutilizable",
        "No es tiempo real: hay que grabar y luego enviar",
        "Requiere API key, endpoint local y llamada a Google",
        "Latencia de red y coste por tokens (nivel gratuito limitado)",
    ),
]


def _porcentaje(valor: float | None) -> str:
    return "—" if valor is None else f"{valor * 100:.1f}%"


def _wer(valor: float | None) -> str:
    return "—" if valor is None else f"{valor * 100:.1f}%"


def escribir_informe(datos: dict) -> None:
    lineas: list[str] = []
    lineas.append("# Informe de verificación · Speech-to-Text con Gemini\n")
    lineas.append(
        "Comparación de los **dos métodos** solicitados sobre los audios de prueba en español: "
        "**Web Speech API** (tiempo real, navegador) y **Gemini** (procesamiento por lotes).\n"
    )
    lineas.append("## 1. Metodología\n")
    lineas.append(
        "- Referencia (verdad de oro): `audios/esperado.json`.\n"
        "- Métrica: **WER** (*Word Error Rate*) calculado sobre tokens; 0% es perfecto y 100% es total.\n"
        "- Normalización previa: minúsculas, sin tildes, sin puntuación y espacios simples.\n"
        "- *Exacto*: la transcripción normalizada coincide al 100% con la referencia.\n"
        "- Fuentes: Web Speech → `results/sesiones.json`; Gemini → `results/gemini.json`.\n"
    )

    lineas.append("## 2. Resultado por audio\n")
    lineas.append("| Audio | Tipo | WER Web Speech | WER Gemini | Exacto WS | Exacto Gemini | Ganador |")
    lineas.append("|---|---|---|---|---|---|---|")
    for fila in datos["filas"]:
        lineas.append(
            f"| {fila['clave']} | {fila['tipo']} | {_wer(fila['webspeech']['wer'])} "
            f"| {_wer(fila['gemini']['wer'])} | {'sí' if fila['webspeech']['exacto'] else 'no'} "
            f"| {'sí' if fila['gemini']['exacto'] else 'no'} | {fila['ganador']} |"
        )
    lineas.append("")

    lineas.append("## 3. Resumen por método\n")
    lineas.append("| Método | Audios evaluados | WER medio | Exactitud | Cobertura |")
    lineas.append("|---|---|---|---|---|")
    for nombre, resumen in datos["resumen"].items():
        cobertura = f"{resumen['evaluados']}/{datos['total_audios']}"
        lineas.append(
            f"| {nombre} | {resumen['evaluados']} | {_wer(resumen['wer_medio'])} "
            f"| {_porcentaje(resumen['exactitud'])} | {cobertura} |"
        )
    lineas.append("")

    lineas.append("## 4. Transcripciones obtenidas\n")
    for fila in datos["filas"]:
        lineas.append(f"### {fila['clave']} ({fila['tipo']})\n")
        lineas.append(f"- **Referencia**: {fila['referencia']}\n")
        ws = fila["webspeech"]["texto"] or "_(sin datos: graba el audio y guarda la sesión)_"
        gm = fila["gemini"]["texto"] or "_(sin datos: ejecuta scripts/gemini_stt.py)_"
        lineas.append(f"- **Web Speech API**: {ws}\n")
        lineas.append(f"- **Gemini**: {gm}\n")
        lineas.append("")

    lineas.append("## 5. Ventajas y desventajas\n")
    lineas.append("| Método | Ventajas | Desventajas |")
    lineas.append("|---|---|---|")
    for nombre, *resto in VENTAJAS:
        ventajas = resto[:3]
        desventajas = resto[3:]
        lineas.append(
            f"| **{nombre}** | {'<br>'.join('· ' + v for v in ventajas)} "
            f"| {'<br>'.join('· ' + d for d in desventajas)} |"
        )
    lineas.append("")

    lineas.append("## 6. Conclusiones\n")
    resumen = datos["resumen"]
    ws_medio = resumen["Web Speech API"]["wer_medio"]
    gm_medio = resumen["Gemini"]["wer_medio"]
    if ws_medio is None or gm_medio is None:
        lineas.append(
            "- **Faltan datos**: todavía no hay transcripciones de los dos métodos.\n"
            "  1. Graba (o sube) los tres audios en la interfaz y pulsa *Guardar sesión*.\n"
            "  2. Ejecuta `.venv\\Scripts\\python scripts\\gemini_stt.py` (o envía cada audio desde la interfaz).\n"
            "  3. Vuelve a ejecutar `python scripts\\informe.py`.\n"
        )
    else:
        mejor = "Gemini" if gm_medio < ws_medio else "Web Speech API" if ws_medio < gm_medio else "ninguno"
        lineas.append(
            f"- WER medio: **Web Speech API {resumen['Web Speech API']['wer_medio'] * 100:.1f}%** vs "
            f"**Gemini {resumen['Gemini']['wer_medio'] * 100:.1f}%** → el mejor de esta tanda es **{mejor}**.\n"
        )
        lineas.append(
            f"- Exactitud (transcripción idéntica a la referencia): Web Speech "
            f"{_porcentaje(resumen['Web Speech API']['exactitud'])} vs Gemini "
            f"{_porcentaje(resumen['Gemini']['exactitud'])}.\n"
        )
        victorias = datos["victorias"]
        lineas.append(
            f"- Victoria por audio: {victorias.get('Gemini', 0)} a {victorias.get('Web Speech', 0)} "
            f"(empates: {datos['total_audios'] - sum(victorias.values())}).\n"
        )
        lineas.append(
            "- Uso recomendado: Web Speech API para **vista previa en tiempo real** de la interfaz "
            "(sin coste ni backend) y Gemini para la **transcripción definitiva y por lotes**, "
            "cuando se necesita robustez o se procesan ficheros grabados previamente.\n"
        )

    SALIDA_MD.parent.mkdir(exist_ok=True)
    SALIDA_MD.write_text("\n".join(lineas), encoding="utf-8")
    SALIDA_JSON.write_text(json.dumps(datos, ensure_ascii=False, indent=2), encoding="utf-8")


def main() -> int:
    if not ESPERADO_PATH.is_file():
        print(f"Falta {ESPERADO_PATH}", file=sys.stderr)
        return 1
    datos = evaluar()
    escribir_informe(datos)
    print(f"Informe escrito en {SALIDA_MD.relative_to(ROOT)} y {SALIDA_JSON.relative_to(ROOT)}\n")
    for nombre, resumen in datos["resumen"].items():
        medio = "—" if resumen["wer_medio"] is None else f"{resumen['wer_medio'] * 100:.1f}%"
        print(f"  {nombre:<18} evaluados={resumen['evaluados']}  WER medio={medio}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
