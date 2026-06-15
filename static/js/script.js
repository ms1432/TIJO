/* =========================================================
   Asystent Kodu — logika frontendu
   ========================================================= */

const els = {
    code: document.getElementById("code"),
    highlight: document.getElementById("highlight"),
    language: document.getElementById("language"),
    instructions: document.getElementById("instructions"),
    editorLoader: document.getElementById("editorLoader"),
    analyzeBtn: document.getElementById("analyzeBtn"),
    clearBtn: document.getElementById("clearBtn"),
    sampleBtn: document.getElementById("sampleBtn"),
    copyBtn: document.getElementById("copyBtn"),
    emptyState: document.getElementById("emptyState"),
    loader: document.getElementById("loader"),
    errorBox: document.getElementById("errorBox"),
    results: document.getElementById("results"),
    scoreRing: document.getElementById("scoreRing"),
    scoreValue: document.getElementById("scoreValue"),
    langBadge: document.getElementById("langBadge"),
    summary: document.getElementById("summary"),
    issuesList: document.getElementById("issuesList"),
    issuesCount: document.getElementById("issuesCount"),
    testsList: document.getElementById("testsList"),
    testsCount: document.getElementById("testsCount"),
    improvedSection: document.getElementById("improvedSection"),
    improvedCode: document.getElementById("improvedCode"),
    verifyBadge: document.getElementById("verifyBadge"),
};

const SAMPLE = `def get_user_discount(users, user_id):
    user = [u for u in users if u['id'] == user_id][0]
    discount = user['orders'] / user['years_active']
    if user['is_premium'] == True:
        discount = discount * 2
    return discount`;

/** Zabezpieczenie przed XSS przy wstawianiu tekstu do HTML. */
function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str ?? "";
    return div.innerHTML;
}

/* ---------- Podświetlanie składni (kolory jak w VS Code) ---------- */

/** Mapuje etykietę z listy języków na identyfikator highlight.js. */
const LANG_MAP = {
    Python: "python",
    JavaScript: "javascript",
    TypeScript: "typescript",
    Java: "java",
    "C#": "csharp",
    "C++": "cpp",
    Go: "go",
    PHP: "php",
    SQL: "sql",
};

/** Pre będący kontenerem przewijania warstwy podświetlenia. */
const highlightPre = els.highlight.parentElement;

/** Synchronizuje przewijanie warstwy podświetlenia z polem tekstowym. */
function syncScroll() {
    highlightPre.scrollTop = els.code.scrollTop;
    highlightPre.scrollLeft = els.code.scrollLeft;
}

/** Renderuje podświetlony kod pod przezroczystym polem tekstowym. */
function highlightCode() {
    const code = els.code.value;
    let html;

    if (window.hljs) {
        const langKey = LANG_MAP[els.language.value];
        if (langKey && hljs.getLanguage(langKey)) {
            html = hljs.highlight(code, { language: langKey }).value;
        } else {
            // "Wykryj automatycznie" — niech highlight.js zgadnie język
            html = hljs.highlightAuto(code).value;
        }
    } else {
        // CDN niedostępny — pokaż przynajmniej czysty (bezpieczny) tekst
        html = escapeHtml(code);
    }

    // Dodatkowy znak nowej linii utrzymuje wysokość ostatniej (pustej) linii.
    els.highlight.innerHTML = html + "\n";
    syncScroll();
}

/** Przełącza widoczne stany panelu wyników. */
function showState(state) {
    els.emptyState.classList.toggle("hidden", state !== "empty");
    els.loader.classList.toggle("hidden", state !== "loading");
    els.results.classList.toggle("hidden", state !== "results");
    els.errorBox.classList.toggle("hidden", state !== "error");
}

function showError(message) {
    els.errorBox.textContent = message;
    showState("error");
}

/** Zwraca kolor pierścienia oceny w zależności od wyniku. */
function scoreColor(score) {
    if (score >= 80) return "var(--green)";
    if (score >= 50) return "var(--amber)";
    return "var(--red)";
}

/** Animuje licznik oceny od 0 do wartości docelowej. */
function animateScore(target) {
    let current = 0;
    const color = scoreColor(target);
    els.scoreRing.style.setProperty("--ring-color", color);
    const step = Math.max(1, Math.round(target / 30));
    const timer = setInterval(() => {
        current = Math.min(target, current + step);
        els.scoreValue.textContent = current;
        els.scoreRing.style.setProperty("--val", current);
        if (current >= target) clearInterval(timer);
    }, 16);
}

function renderIssues(issues) {
    els.issuesCount.textContent = issues.length;
    if (!issues.length) {
        els.issuesList.innerHTML =
            '<div class="no-issues">✓ Nie wykryto istotnych problemów. Dobra robota!</div>';
        return;
    }
    els.issuesList.innerHTML = issues
        .map((issue) => {
            const sev = (issue.severity || "niski").toLowerCase();
            return `
            <div class="issue-card ${sev}">
                <div class="issue-top">
                    <span class="sev-tag ${sev}">${escapeHtml(issue.severity || "niski")}</span>
                    <span class="issue-title">${escapeHtml(issue.title || "Problem")}</span>
                </div>
                <p class="issue-desc">${escapeHtml(issue.description || "")}</p>
                ${
                    issue.suggestion
                        ? `<div class="issue-fix"><strong>Poprawka:</strong> ${escapeHtml(
                              issue.suggestion
                          )}</div>`
                        : ""
                }
            </div>`;
        })
        .join("");
}

function renderTests(tests) {
    els.testsCount.textContent = tests.length;
    if (!tests.length) {
        els.testsList.innerHTML =
            '<p class="issue-desc">Brak dodatkowych sugestii testowych.</p>';
        return;
    }
    els.testsList.innerHTML = tests
        .map((t) => {
            const code = (t.code || "").trim();
            const codeBlock = code
                ? `<pre class="test-code"><code class="hljs">${
                      window.hljs ? hljs.highlightAuto(code).value : escapeHtml(code)
                  }</code></pre>`
                : "";
            return `
            <div class="test-card">
                <div class="test-name">${escapeHtml(t.name || "Scenariusz testowy")}</div>
                <p class="test-desc">${escapeHtml(t.description || "")}</p>
                ${codeBlock}
            </div>`;
        })
        .join("");
}

/** Zwraca podświetlony kod jako HTML (preferuje wskazany język, w razie potrzeby zgaduje). */
function highlightToHtml(code, langLabel) {
    if (!window.hljs) return escapeHtml(code);
    const langKey = LANG_MAP[langLabel];
    if (langKey && hljs.getLanguage(langKey)) {
        return hljs.highlight(code, { language: langKey }).value;
    }
    return hljs.highlightAuto(code).value;
}

/** Pokazuje wynik automatycznej weryfikacji poprawionego kodu (lub chowa plakietkę). */
function renderVerifyBadge(verification) {
    const badge = els.verifyBadge;
    if (!verification) {
        badge.classList.add("hidden");
        return;
    }
    const score = verification.quality_score;
    if (verification.has_blockers) {
        badge.className = "verify-badge warn";
        badge.textContent =
            score != null
                ? `⚠ zweryfikowano: ${score}/100, wciąż są poważne uwagi`
                : "⚠ zweryfikowano: wciąż są poważne uwagi";
    } else {
        badge.className = "verify-badge ok";
        badge.textContent =
            score != null
                ? `√ zweryfikowano przez AI: ${score}/100`
                : "√ zweryfikowano przez AI";
    }
}

function renderResults(data) {
    animateScore(Number(data.quality_score) || 0);
    els.langBadge.textContent = data.language || "Nieznany";
    els.summary.textContent = data.summary || "";

    renderIssues(Array.isArray(data.issues) ? data.issues : []);
    renderTests(Array.isArray(data.test_cases) ? data.test_cases : []);

    if (data.improved_code && data.improved_code.trim()) {
        // Podświetlanie składni (motyw VS Code) jak w edytorze i kodzie testów.
        els.improvedCode.className = "hljs";
        els.improvedCode.innerHTML = highlightToHtml(data.improved_code, data.language);
        renderVerifyBadge(data.improved_verification);
        els.improvedSection.classList.remove("hidden");
    } else {
        els.improvedSection.classList.add("hidden");
    }

    showState("results");
}

async function analyze() {
    const code = els.code.value.trim();
    if (!code) {
        showError("Wklej fragment kodu do analizy.");
        return;
    }

    els.analyzeBtn.disabled = true;
    showState("loading");

    try {
        const res = await fetch("/analyze", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                code,
                language: els.language.value,
                instructions: els.instructions.value.trim(),
            }),
        });
        const data = await res.json();

        if (!res.ok) {
            showError(data.error || "Wystąpił nieoczekiwany błąd.");
            return;
        }
        renderResults(data);
    } catch (err) {
        showError("Nie udało się połączyć z serwerem. Sprawdź, czy aplikacja działa.");
    } finally {
        els.analyzeBtn.disabled = false;
    }
}

/* ---------- Zdarzenia ---------- */
els.analyzeBtn.addEventListener("click", analyze);

// Podświetlanie na żywo podczas pisania/wklejania i przewijania.
els.code.addEventListener("input", highlightCode);
els.code.addEventListener("scroll", syncScroll);
els.language.addEventListener("change", highlightCode);

els.clearBtn.addEventListener("click", () => {
    els.code.value = "";
    highlightCode();
    showState("empty");
    els.code.focus();
});

/** Ustawia listę języków, jeśli zwrócony język pasuje do dostępnej opcji. */
function setLanguageIfKnown(lang) {
    if (!lang) return;
    const match = [...els.language.options].find(
        (o) => o.value.toLowerCase() === String(lang).toLowerCase()
    );
    if (match) els.language.value = match.value;
}

// "Wstaw przykład" — AI generuje przykładowy zły kod w wybranym języku.
els.sampleBtn.addEventListener("click", async () => {
    const original = els.sampleBtn.textContent;
    els.sampleBtn.disabled = true;
    els.sampleBtn.textContent = "Generuję…";
    els.editorLoader.classList.remove("hidden"); // animacja generowania w edytorze
    try {
        const res = await fetch("/sample", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ language: els.language.value }),
        });
        const data = await res.json();
        if (!res.ok) {
            showError(data.error || "Nie udało się wygenerować przykładu.");
            return;
        }
        els.code.value = data.code || SAMPLE;
        setLanguageIfKnown(data.language);
        highlightCode();
        els.code.focus();
    } catch {
        // Brak połączenia — wstaw lokalny przykład awaryjny.
        els.code.value = SAMPLE;
        els.language.value = "Python";
        highlightCode();
        els.code.focus();
    } finally {
        els.editorLoader.classList.add("hidden");
        els.sampleBtn.disabled = false;
        els.sampleBtn.textContent = original;
    }
});

// Tab wstawia wcięcie zamiast przenosić fokus (zachowanie jak w edytorze).
els.code.addEventListener("keydown", (e) => {
    if (e.key !== "Tab") return;
    e.preventDefault();
    const { selectionStart: start, selectionEnd: end, value } = els.code;
    els.code.value = value.slice(0, start) + "    " + value.slice(end);
    els.code.selectionStart = els.code.selectionEnd = start + 4;
    highlightCode();
});

els.copyBtn.addEventListener("click", async () => {
    try {
        await navigator.clipboard.writeText(els.improvedCode.textContent);
        els.copyBtn.textContent = "Skopiowano!";
        setTimeout(() => (els.copyBtn.textContent = "Kopiuj"), 1500);
    } catch {
        els.copyBtn.textContent = "Błąd kopiowania";
    }
});

// Ctrl/Cmd + Enter uruchamia analizę
els.code.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        analyze();
    }
});

// Pierwsze renderowanie (np. gdy przeglądarka przywróci tekst po odświeżeniu).
highlightCode();
