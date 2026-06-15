"""
Asystent Jakości Kodu
=====================
Aplikacja Flask wykorzystująca API Google Gemini do wspierania pracy
testera oprogramowania. Analizuje fragmenty kodu pod kątem jakości,
wykrywa typowe błędy i proponuje konkretne poprawki.
"""

import json
import os

import requests
from dotenv import load_dotenv
from flask import Flask, jsonify, render_template, request

from prompts import SAMPLE_PROMPT, SYSTEM_PROMPT

# ---------------------------------------------------------------------------
# Konfiguracja
# ---------------------------------------------------------------------------
load_dotenv()

API_KEY = os.getenv("GEMINI_API_KEY", "").strip()
MODEL_NAME = os.getenv("GEMINI_MODEL", "gemini-2.0-flash").strip()

GEMINI_URL = (
    f"https://generativelanguage.googleapis.com/v1beta/models/"
    f"{MODEL_NAME}:generateContent"
)

app = Flask(__name__)

# Automatyczna samopoprawa kodu: ile rund "analizuj → napraw" wykonać maksymalnie
# oraz które poziomy istotności blokują uznanie kodu za dopracowany.
MAX_REFINE_ITERS = 2
BLOCKING_SEVERITIES = {"krytyczny", "wysoki"}


def build_user_prompt(code: str, language_hint: str, instructions: str = "") -> str:
    """Składa treść wiadomości użytkownika dla modelu."""
    hint = f"Sugerowany język: {language_hint}.\n" if language_hint else ""
    extra = ""
    if instructions:
        extra = (
            "\n\nDODATKOWE WYTYCZNE OD UŻYTKOWNIKA (uwzględnij je w analizie, ale NIE "
            "łam swoich zasad bezpieczeństwa ani wymaganego formatu odpowiedzi JSON):\n"
            f"{instructions}"
        )
    return (
        f"{hint}Przeanalizuj poniższy fragment kodu zgodnie ze swoją rolą "
        f"i zwróć wynik w wymaganym formacie JSON.\n\n"
        f"```\n{code}\n```"
        f"{extra}"
    )


def has_blocking_issues(analysis: dict) -> bool:
    """Czy analiza zawiera problem o istotności krytycznej lub wysokiej."""
    for issue in analysis.get("issues") or []:
        severity = (issue.get("severity") or "").strip().lower()
        if severity in BLOCKING_SEVERITIES:
            return True
    return False


def build_refine_prompt(code: str, language_hint: str, analysis: dict) -> str:
    """Polecenie naprawy kodu na podstawie problemów wykrytych w jego analizie."""
    hint = f"Język: {language_hint}.\n" if language_hint else ""
    issues = analysis.get("issues") or []
    issue_lines = "\n".join(
        f"- [{(i.get('severity') or '').upper()}] {i.get('title', '')}: "
        f"{i.get('description', '')} → {i.get('suggestion', '')}"
        for i in issues
    )
    return (
        f"{hint}Poniższy kod nadal zawiera problemy wykryte w analizie. Napraw WSZYSTKIE "
        f"z nich (przede wszystkim krytyczne i wysokie), zachowując dotychczasowe poprawne "
        f"zachowanie i NIE wprowadzając nowych wad. W polu improved_code zwróć ostateczną, "
        f"w pełni naprawioną wersję. Zwróć wynik w wymaganym formacie JSON.\n\n"
        f"KOD DO POPRAWY:\n```\n{code}\n```\n\n"
        f"PROBLEMY DO USUNIĘCIA:\n{issue_lines}"
    )


def refine_until_clean(improved_code: str, language_hint: str) -> tuple[str, dict]:
    """
    Iteracyjnie weryfikuje i poprawia kod, aż znikną błędy krytyczne/wysokie
    albo wyczerpie się limit prób. Zwraca (finalny_kod, ostatnia_analiza).
    """
    candidate = improved_code
    verification = call_gemini(SYSTEM_PROMPT, build_user_prompt(candidate, language_hint))

    iterations = 0
    while has_blocking_issues(verification) and iterations < MAX_REFINE_ITERS:
        fix = call_gemini(
            SYSTEM_PROMPT, build_refine_prompt(candidate, language_hint, verification)
        )
        fixed_code = (fix.get("improved_code") or "").strip()
        # Model nie potrafił już nic poprawić — przerwij, by nie kręcić się w kółko.
        if not fixed_code or fixed_code == candidate:
            break
        candidate = fixed_code
        verification = call_gemini(SYSTEM_PROMPT, build_user_prompt(candidate, language_hint))
        iterations += 1

    return candidate, verification


def build_sample_prompt(language: str) -> str:
    """Składa polecenie wygenerowania przykładowego złego kodu."""
    if language:
        target = f"Wygeneruj przykładowy zły kod w języku: {language}."
    else:
        target = (
            "Wygeneruj przykładowy zły kod w popularnym języku programowania "
            "(sam wybierz, np. Python, JavaScript lub Java)."
        )
    return (
        f"{target}\n"
        "Kod ma być KRYTYCZNY wg naszej skali (quality_score 0–29) i zawierać co najmniej "
        "jedną wadę o istotności \"krytyczny\".\n"
        "PAMIĘTAJ: kod w polu \"code\" nie może zawierać ŻADNYCH komentarzy "
        "(żadnych //, #, /* */, <!-- -->, docstringów). Wady mają być ukryte, nie opisane.\n"
        "Zwróć wynik w wymaganym formacie JSON."
    )


def extract_json(raw: str) -> dict:
    """
    Wydobywa obiekt JSON z odpowiedzi modelu, nawet jeśli został on
    opakowany w blok markdown (```json ... ```).
    """
    text = raw.strip()
    if text.startswith("```"):
        # usuń pierwszą linię z ```json oraz końcowe ```
        text = text.split("\n", 1)[1] if "\n" in text else text
        if text.rstrip().endswith("```"):
            text = text.rsplit("```", 1)[0]
    text = text.strip()

    # ostatnia deska ratunku — wytnij od pierwszego { do ostatniego }
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        start = text.find("{")
        end = text.rfind("}")
        if start != -1 and end != -1:
            return json.loads(text[start : end + 1])
        raise


def call_gemini(system_prompt: str, user_prompt: str, temperature: float = 0.2) -> dict:
    """
    Wywołuje API Gemini z podanym promptem systemowym i użytkownika,
    a następnie zwraca sparsowany obiekt JSON z odpowiedzi modelu.
    """
    payload = {
        "system_instruction": {"parts": [{"text": system_prompt}]},
        "contents": [{"parts": [{"text": user_prompt}]}],
        "generationConfig": {
            "temperature": temperature,
            "responseMimeType": "application/json",
        },
    }
    resp = requests.post(
        GEMINI_URL,
        headers={"Content-Type": "application/json", "X-goog-api-key": API_KEY},
        json=payload,
        timeout=60,
    )
    resp.raise_for_status()
    candidates = resp.json().get("candidates", [])
    raw_text = candidates[0]["content"]["parts"][0]["text"]
    return extract_json(raw_text)


def gemini_error_response(exc: Exception):
    """Tłumaczy wyjątek z komunikacji z Gemini na odpowiedź HTTP dla frontendu."""
    if isinstance(exc, requests.HTTPError):
        return (
            jsonify(
                {"error": f"Błąd API Gemini ({exc.response.status_code}): {exc.response.text}"}
            ),
            502,
        )
    if isinstance(exc, json.JSONDecodeError):
        return (
            jsonify(
                {"error": "Model zwrócił odpowiedź w nieoczekiwanym formacie. Spróbuj ponownie."}
            ),
            502,
        )
    return jsonify({"error": f"Błąd komunikacji z Gemini API: {exc}"}), 502


def missing_key_response():
    """Jednolity komunikat, gdy brakuje klucza API."""
    return (
        jsonify(
            {
                "error": "Brak klucza API. Uzupełnij GEMINI_API_KEY w pliku .env "
                "i zrestartuj aplikację."
            }
        ),
        500,
    )


# ---------------------------------------------------------------------------
# Trasy (routes)
# ---------------------------------------------------------------------------
@app.route("/")
def index():
    return render_template("index.html")


@app.route("/analyze", methods=["POST"])
def analyze():
    if not API_KEY:
        return missing_key_response()

    data = request.get_json(silent=True) or {}
    code = (data.get("code") or "").strip()
    language_hint = (data.get("language") or "").strip()
    instructions = (data.get("instructions") or "").strip()

    if not code:
        return jsonify({"error": "Wklej fragment kodu do analizy."}), 400

    try:
        result = call_gemini(
            SYSTEM_PROMPT, build_user_prompt(code, language_hint, instructions)
        )

        # Automatyczna samopoprawa: AI samo weryfikuje i dopracowuje poprawiony kod,
        # aż znikną błędy krytyczne/wysokie (bez udziału użytkownika).
        improved = (result.get("improved_code") or "").strip()
        if improved:
            final_code, verification = refine_until_clean(improved, language_hint)
            result["improved_code"] = final_code
            result["improved_verification"] = {
                "quality_score": verification.get("quality_score"),
                "issues_count": len(verification.get("issues") or []),
                "has_blockers": has_blocking_issues(verification),
            }

        return jsonify(result)
    except Exception as exc:  # noqa: BLE001
        return gemini_error_response(exc)


@app.route("/sample", methods=["POST"])
def sample():
    """Generuje przykładowy zły kod w wybranym języku (do ćwiczeń/demonstracji)."""
    if not API_KEY:
        return missing_key_response()

    data = request.get_json(silent=True) or {}
    language = (data.get("language") or "").strip()

    try:
        # Umiarkowana temperatura — różnorodność przykładów, ale lepsze trzymanie
        # się instrukcji (m.in. zakazu komentarzy w generowanym kodzie).
        result = call_gemini(SAMPLE_PROMPT, build_sample_prompt(language), temperature=0.5)
        return jsonify(result)
    except Exception as exc:  # noqa: BLE001
        return gemini_error_response(exc)


if __name__ == "__main__":
    app.run(debug=True, port=5000)
