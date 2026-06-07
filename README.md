# 🛡️ QA Sentinel — Asystent Jakości Kodu

Aplikacja webowa wspierająca pracę testera oprogramowania. Wykorzystuje
**API Google Gemini** do analizy fragmentów kodu: wykrywa błędy, luki
bezpieczeństwa i przypadki brzegowe, proponuje konkretne poprawki oraz
sugeruje scenariusze testowe.

Zbudowana w oparciu o **Python + Flask** (backend) oraz **HTML + CSS + JavaScript** (frontend).

---

## ✨ Funkcje

- **Analiza kodu jednym kliknięciem** — wklej kod, resztę robi agent AI.
- **Wyrafinowany prompt** — model wciela się w rolę eksperta QA ("QA Sentinel")
  i zwraca ustrukturyzowany raport.
- **Ocena jakości 0–100** z czytelnym wskaźnikiem.
- **Lista problemów** z poziomem istotności (krytyczny / wysoki / średni / niski).
- **Sugerowane scenariusze testowe.**
- **Gotowy, poprawiony kod** z przyciskiem kopiowania.
- **Estetyczny, ciemny interfejs**, responsywny układ, skrót `Ctrl/Cmd + Enter`.

---

## 📁 Struktura projektu

```
code-quality-assistant/
├── app.py                 # Backend Flask + integracja z Gemini
├── requirements.txt       # Zależności Pythona
├── .env                   # Tutaj wpisujesz swój klucz API (nie commituj!)
├── .env.example           # Wzór pliku .env
├── templates/
│   └── index.html         # Interfejs użytkownika
└── static/
    ├── css/style.css      # Style
    └── js/script.js       # Logika frontendu
```

---

## 🚀 Uruchomienie

### 1. Zainstaluj zależności

```powershell
pip install -r requirements.txt
```

### 2. Wpisz klucz API

Otwórz plik `.env` i uzupełnij wartość `GEMINI_API_KEY`:

```
GEMINI_API_KEY=twoj_klucz_tutaj
```

> Klucz wygenerujesz za darmo w [Google AI Studio](https://aistudio.google.com/app/apikey).

### 3. Uruchom aplikację

```powershell
python app.py
```

Otwórz w przeglądarce: **http://localhost:5000**

---

## 🧠 Jak to działa

1. Użytkownik wkleja fragment kodu w interfejsie.
2. Frontend wysyła kod do endpointu `POST /analyze`.
3. Backend dołącza **systemowy prompt persony eksperta QA** i wywołuje
   model Gemini, wymuszając odpowiedź w formacie JSON.
4. Wynik jest renderowany jako przejrzysty raport jakości.

Całość ciężkiej pracy wykonuje model LLM — użytkownik wykonuje minimum czynności.

---

## ⚙️ Konfiguracja

| Zmienna w `.env` | Opis | Domyślnie |
|---|---|---|
| `GEMINI_API_KEY` | Klucz API do Google Gemini (wymagany) | — |
| `GEMINI_MODEL` | Nazwa modelu Gemini | `gemini-2.0-flash` |
