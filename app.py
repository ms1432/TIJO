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

# ---------------------------------------------------------------------------
# Wyrafinowany prompt systemowy (persona agenta)
# ---------------------------------------------------------------------------
SYSTEM_PROMPT = """\
Jesteś "QA Sentinel" — światowej klasy ekspertem od testowania i jakości
oprogramowania z 15-letnim doświadczeniem w przeglądach kodu (code review),
testach automatycznych oraz bezpieczeństwie aplikacji.

TWOJA TOŻSAMOŚĆ I STYL:
- Analizujesz kod chłodnym, inżynierskim okiem — precyzyjnie, zwięźle i profesjonalnie.
- Nie owijasz w bawełnę: wskazujesz realne problemy, ale zawsze konstruktywnie.
- Każdą uwagę popierasz uzasadnieniem ("dlaczego to problem") i konkretną poprawką ("jak to naprawić").
- Nie wymyślasz problemów, których nie ma. Jeśli kod jest dobry, masz odwagę to przyznać.

CO ANALIZUJESZ:
1. Błędy logiczne i potencjalne wyjątki (np. dzielenie przez zero, null/None, indeksy poza zakresem).
2. Przypadki brzegowe (edge cases), których kod nie obsługuje.
3. Luki bezpieczeństwa (np. SQL injection, XSS, niebezpieczne deserializacje, twarde hasła).
4. Czytelność, nazewnictwo, zgodność z dobrymi praktykami i konwencjami danego języka.
5. Wydajność i potencjalne wycieki zasobów.
6. Brakujące lub słabe scenariusze testowe.

ZASADY ODPOWIEDZI:
- Skup się na rzeczach istotnych. Nie zgłaszaj kosmetyki jako błędu krytycznego.
- Przypisuj każdemu znalezisku poziom istotności: "krytyczny", "wysoki", "średni" lub "niski".
- Sugestie testów mają być konkretne (nazwa scenariusza + co weryfikuje).
- Poprawiony kod ma być kompletny i gotowy do wklejenia.

FORMAT ODPOWIEDZI:
Odpowiadasz WYŁĄCZNIE poprawnym obiektem JSON (bez markdown, bez ```), o strukturze:
{
  "language": "wykryty język programowania",
  "summary": "1-2 zdania zwięzłej oceny ogólnej kodu",
  "quality_score": <liczba 0-100 oceniająca ogólną jakość>,
  "issues": [
    {
      "severity": "krytyczny | wysoki | średni | niski",
      "title": "krótki tytuł problemu",
      "description": "na czym polega problem i dlaczego jest istotny",
      "suggestion": "konkretna propozycja naprawy"
    }
  ],
  "test_cases": [
    {
      "name": "nazwa scenariusza testowego",
      "description": "co dokładnie weryfikuje i dlaczego jest ważny"
    }
  ],
  "improved_code": "pełny, poprawiony fragment kodu jako string (zachowaj wcięcia i znaki nowej linii)"
}

Jeśli kod nie zawiera istotnych problemów, zwróć pustą tablicę "issues" i napisz to w "summary".
Zawsze zwracaj prawidłowy JSON dający się sparsować.\
"""


def build_user_prompt(code: str, language_hint: str) -> str:
    """Składa treść wiadomości użytkownika dla modelu."""
    hint = f"Sugerowany język: {language_hint}.\n" if language_hint else ""
    return (
        f"{hint}Przeanalizuj poniższy fragment kodu zgodnie ze swoją rolą "
        f"i zwróć wynik w wymaganym formacie JSON.\n\n"
        f"```\n{code}\n```"
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


# ---------------------------------------------------------------------------
# Trasy (routes)
# ---------------------------------------------------------------------------
@app.route("/")
def index():
    return render_template("index.html")


@app.route("/analyze", methods=["POST"])
def analyze():
    if not API_KEY:
        return (
            jsonify(
                {
                    "error": "Brak klucza API. Uzupełnij GEMINI_API_KEY w pliku .env "
                    "i zrestartuj aplikację."
                }
            ),
            500,
        )

    data = request.get_json(silent=True) or {}
    code = (data.get("code") or "").strip()
    language_hint = (data.get("language") or "").strip()

    if not code:
        return jsonify({"error": "Wklej fragment kodu do analizy."}), 400

    payload = {
        "system_instruction": {"parts": [{"text": SYSTEM_PROMPT}]},
        "contents": [
            {"parts": [{"text": build_user_prompt(code, language_hint)}]}
        ],
        "generationConfig": {
            "temperature": 0.2,
            "responseMimeType": "application/json",
        },
    }

    try:
        resp = requests.post(
            GEMINI_URL,
            headers={
                "Content-Type": "application/json",
                "X-goog-api-key": API_KEY,
            },
            json=payload,
            timeout=60,
        )
        resp.raise_for_status()
        candidates = resp.json().get("candidates", [])
        raw_text = candidates[0]["content"]["parts"][0]["text"]
        result = extract_json(raw_text)
        return jsonify(result)

    except requests.HTTPError as exc:
        return jsonify({"error": f"Błąd API Gemini ({exc.response.status_code}): {exc.response.text}"}), 502
    except json.JSONDecodeError:
        return (
            jsonify(
                {"error": "Model zwrócił odpowiedź w nieoczekiwanym formacie. Spróbuj ponownie."}
            ),
            502,
        )
    except Exception as exc:  # noqa: BLE001
        return jsonify({"error": f"Błąd komunikacji z Gemini API: {exc}"}), 502


if __name__ == "__main__":
    app.run(debug=True, port=5000)
