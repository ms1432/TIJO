/* =========================================================
   QA Sentinel — logika frontendu
   ========================================================= */

const els = {
    code: document.getElementById("code"),
    language: document.getElementById("language"),
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
        .map(
            (t) => `
            <div class="test-card">
                <div class="test-name">${escapeHtml(t.name || "Scenariusz testowy")}</div>
                <p class="test-desc">${escapeHtml(t.description || "")}</p>
            </div>`
        )
        .join("");
}

function renderResults(data) {
    animateScore(Number(data.quality_score) || 0);
    els.langBadge.textContent = data.language || "Nieznany";
    els.summary.textContent = data.summary || "";

    renderIssues(Array.isArray(data.issues) ? data.issues : []);
    renderTests(Array.isArray(data.test_cases) ? data.test_cases : []);

    if (data.improved_code && data.improved_code.trim()) {
        els.improvedCode.textContent = data.improved_code;
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
            body: JSON.stringify({ code, language: els.language.value }),
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

els.clearBtn.addEventListener("click", () => {
    els.code.value = "";
    showState("empty");
    els.code.focus();
});

els.sampleBtn.addEventListener("click", () => {
    els.code.value = SAMPLE;
    els.code.focus();
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
