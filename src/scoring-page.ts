import type { ScoringResult, ScoringConfig, ThematiqueScore } from "./scoring.js";

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function fmtDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}m${s.toString().padStart(2, "0")}s`;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function scoreBar(score: number, maxScore: number): string {
  const pct = maxScore > 0 ? Math.round((score / maxScore) * 100) : 0;
  return `<div class="score-bar"><div class="score-fill" style="width:${pct}%"></div><span>${score}</span></div>`;
}

function thematiqueRow(t: ThematiqueScore, maxScore: number): string {
  const topArts = t.topArticles
    .slice(0, 3)
    .map(
      (a) =>
        `<div class="top-art"><a href="https://francaisalondres.com${esc(a.page)}" target="_blank">${esc(a.title)}</a> <span class="meta">${a.visitors} vis. / ${fmtDuration(a.visitDuration)}</span></div>`
    )
    .join("");

  return `<tr>
    <td><strong>${esc(t.label)}</strong><div class="art-count">${t.articleCount} articles</div></td>
    <td>${scoreBar(t.score, maxScore)}</td>
    <td>${Math.round(t.avgPageviews)}</td>
    <td>${fmtDuration(t.avgDuration)}</td>
    <td>${Math.round(t.avgBounceRate)}%</td>
    <td>${topArts || "<em>-</em>"}</td>
  </tr>`;
}

export function scoringPage(data: ScoringResult | null): string {
  if (!data) {
    return page(
      "Scoring",
      `<p>Aucune donnee de scoring disponible.</p>
       <p>Lancez le calcul pour generer les scores.</p>
       <button class="btn" onclick="runScoring()">Calculer maintenant</button>
       <script>
       async function runScoring() {
         const btn = event.target;
         btn.disabled = true;
         btn.textContent = 'Calcul en cours...';
         try {
           const res = await fetch('/api/scoring/run', { method: 'POST' });
           if (res.ok) location.reload();
           else alert('Erreur: ' + await res.text());
         } catch(e) { alert(e.message); }
       }
       </script>`
    );
  }

  const maxScore = Math.max(...data.thematiques.map((t) => t.score), 1);

  const themRows = data.thematiques
    .filter((t) => t.articleCount > 0)
    .map((t) => thematiqueRow(t, maxScore))
    .join("");

  const emptyThems = data.thematiques
    .filter((t) => t.articleCount === 0)
    .map((t) => t.label)
    .join(", ");

  const topArticlesRows = data.topArticles
    .slice(0, 20)
    .map(
      (a, i) =>
        `<tr>
          <td>${i + 1}</td>
          <td><a href="https://francaisalondres.com${esc(a.page)}" target="_blank">${esc(a.title)}</a></td>
          <td><span class="badge badge-${a.thematique}">${esc(a.thematique)}</span></td>
          <td>${a.visitors}</td>
          <td>${a.pageviews}</td>
          <td>${fmtDuration(a.visitDuration)}</td>
          <td>${Math.round(a.bounceRate)}%</td>
        </tr>`
    )
    .join("");

  // Insights: correlations
  const artsByDuration = [...data.topArticles].sort((a, b) => b.visitDuration - a.visitDuration);
  const longDurationArts = artsByDuration.slice(0, 5);
  const avgDurTop = longDurationArts.reduce((s, a) => s + a.visitDuration, 0) / (longDurationArts.length || 1);

  const insights = generateInsights(data);

  return page(
    "Scoring intelligent",
    `
    <div class="header-bar">
      <div>
        <p class="meta">Derniere mise a jour : ${fmtDate(data.generatedAt)} | Periode : ${data.period}</p>
      </div>
      <button class="btn btn-sm" onclick="runScoring()">Recalculer</button>
    </div>

    <!-- Site stats -->
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-value">${data.siteStats.visitors.toLocaleString("fr-FR")}</div>
        <div class="stat-label">Visiteurs</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${data.siteStats.pageviews.toLocaleString("fr-FR")}</div>
        <div class="stat-label">Pages vues</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${fmtDuration(data.siteStats.avgDuration)}</div>
        <div class="stat-label">Duree moy.</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${Math.round(data.siteStats.bounceRate)}%</div>
        <div class="stat-label">Taux de rebond</div>
      </div>
    </div>

    <!-- Member stats -->
    <div class="stats-grid" style="margin-top:12px;">
      <div class="stat-card">
        <div class="stat-value">${data.memberStats.totalFree.toLocaleString("fr-FR")}</div>
        <div class="stat-label">Membres gratuits</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${data.memberStats.totalPaid.toLocaleString("fr-FR")}</div>
        <div class="stat-label">Membres payants</div>
      </div>
      <div class="stat-card accent">
        <div class="stat-value">+${data.memberStats.newFree30d}</div>
        <div class="stat-label">Nouveaux free (30j)</div>
      </div>
      <div class="stat-card accent-gold">
        <div class="stat-value">+${data.memberStats.newPaid30d}</div>
        <div class="stat-label">Nouveaux paid (30j)</div>
      </div>
    </div>

    <!-- Insights -->
    <h2>Insights</h2>
    <div class="insights">
      ${insights.map((ins) => `<div class="insight"><span class="insight-icon">${ins.icon}</span> ${ins.text}</div>`).join("")}
    </div>

    <!-- Thematiques -->
    <h2>Score par thematique</h2>
    <table class="data-table">
      <thead>
        <tr>
          <th>Thematique</th>
          <th style="min-width:140px;">Score</th>
          <th>Moy. pages vues</th>
          <th>Moy. duree</th>
          <th>Moy. rebond</th>
          <th>Top articles</th>
        </tr>
      </thead>
      <tbody>${themRows}</tbody>
    </table>
    ${emptyThems ? `<p class="meta">Thematiques sans articles : ${emptyThems}</p>` : ""}

    <!-- Top articles -->
    <h2>Top 20 articles</h2>
    <table class="data-table">
      <thead>
        <tr>
          <th>#</th>
          <th>Article</th>
          <th>Theme</th>
          <th>Visiteurs</th>
          <th>Pages vues</th>
          <th>Duree moy.</th>
          <th>Rebond</th>
        </tr>
      </thead>
      <tbody>${topArticlesRows}</tbody>
    </table>

    <!-- Config -->
    <h2>Configuration des poids</h2>
    <form id="configForm" class="config-form">
      <div class="config-row">
        <label>Pages vues <input type="number" step="0.05" min="0" max="1" name="pageviews" value="${data.config.weights.pageviews}"></label>
        <label>Duree visite <input type="number" step="0.05" min="0" max="1" name="visitDuration" value="${data.config.weights.visitDuration}"></label>
        <label>Inscriptions gratuites <input type="number" step="0.05" min="0" max="1" name="freeSignups" value="${data.config.weights.freeSignups}"></label>
        <label>Conversions payantes <input type="number" step="0.05" min="0" max="1" name="paidConversions" value="${data.config.weights.paidConversions}"></label>
      </div>
      <div class="config-row">
        <label>Periode <select name="period">
          <option value="7d" ${data.config.period === "7d" ? "selected" : ""}>7 jours</option>
          <option value="30d" ${data.config.period === "30d" ? "selected" : ""}>30 jours</option>
          <option value="month" ${data.config.period === "month" ? "selected" : ""}>Mois en cours</option>
          <option value="6mo" ${data.config.period === "6mo" ? "selected" : ""}>6 mois</option>
        </select></label>
      </div>
      <button type="submit" class="btn btn-sm">Sauvegarder et recalculer</button>
    </form>

    <script>
    async function runScoring() {
      const btn = event.target;
      btn.disabled = true;
      btn.innerHTML = '<span class="loader"></span>Calcul en cours...';
      try {
        const res = await fetch('/api/scoring/run', { method: 'POST' });
        if (res.ok) location.reload();
        else alert('Erreur: ' + await res.text());
      } catch(e) { alert(e.message); }
      btn.disabled = false;
      btn.textContent = 'Recalculer';
    }

    document.getElementById('configForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const form = new FormData(e.target);
      const config = {
        weights: {
          pageviews: parseFloat(form.get('pageviews')),
          visitDuration: parseFloat(form.get('visitDuration')),
          freeSignups: parseFloat(form.get('freeSignups')),
          paidConversions: parseFloat(form.get('paidConversions')),
        },
        period: form.get('period'),
      };
      const total = Object.values(config.weights).reduce((a, b) => a + b, 0);
      if (Math.abs(total - 1) > 0.01) {
        alert('La somme des poids doit etre egale a 1 (actuellement: ' + total.toFixed(2) + ')');
        return;
      }
      try {
        const res = await fetch('/api/scoring/config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(config),
        });
        if (res.ok) {
          await fetch('/api/scoring/run', { method: 'POST' });
          location.reload();
        } else alert('Erreur: ' + await res.text());
      } catch(e) { alert(e.message); }
    });
    </script>`
  );
}

function generateInsights(data: ScoringResult): Array<{ icon: string; text: string }> {
  const insights: Array<{ icon: string; text: string }> = [];
  const thems = data.thematiques.filter((t) => t.articleCount > 0);

  if (thems.length > 0) {
    const top = thems[0];
    insights.push({
      icon: "1",
      text: `<strong>${esc(top.label)}</strong> est la thematique la plus performante (score ${top.score}, duree moy. ${fmtDuration(top.avgDuration)}).`,
    });
  }

  // Highest duration thematique
  const byDuration = [...thems].sort((a, b) => b.avgDuration - a.avgDuration);
  if (byDuration.length > 0 && byDuration[0].id !== thems[0]?.id) {
    insights.push({
      icon: "T",
      text: `Les articles <strong>${esc(byDuration[0].label)}</strong> ont la duree de lecture la plus longue (${fmtDuration(byDuration[0].avgDuration)} en moyenne).`,
    });
  }

  // Lowest bounce rate
  const byBounce = [...thems].sort((a, b) => a.avgBounceRate - b.avgBounceRate);
  if (byBounce.length > 0) {
    insights.push({
      icon: "R",
      text: `<strong>${esc(byBounce[0].label)}</strong> a le taux de rebond le plus bas (${Math.round(byBounce[0].avgBounceRate)}%), indiquant un fort engagement.`,
    });
  }

  // Member growth
  if (data.memberStats.newPaid30d > 0) {
    const convRate = ((data.memberStats.newPaid30d / (data.siteStats.visitors || 1)) * 100).toFixed(2);
    insights.push({
      icon: "$",
      text: `${data.memberStats.newPaid30d} nouvelles conversions payantes ce mois (taux: ${convRate}% des visiteurs).`,
    });
  }

  // Most articles but low score
  const byArticleCount = [...thems].sort((a, b) => b.articleCount - a.articleCount);
  if (byArticleCount.length > 1) {
    const mostArticles = byArticleCount[0];
    const bestScore = thems[0];
    if (mostArticles.id !== bestScore.id) {
      insights.push({
        icon: "!",
        text: `<strong>${esc(mostArticles.label)}</strong> a le plus d'articles (${mostArticles.articleCount}) mais n'est pas la thematique la mieux scoree. Qualite > quantite.`,
      });
    }
  }

  return insights;
}

function page(title: string, body: string): string {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${title} — Veille FAL</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, sans-serif; max-width: 1100px; margin: 40px auto; padding: 20px; color: #1a1a1a; }
  h1 { font-size: 22px; margin: 0 0 4px 0; }
  h2 { font-size: 17px; margin: 28px 0 12px 0; border-bottom: 1px solid #e5e7eb; padding-bottom: 6px; }
  .meta { color: #666; font-size: 13px; }
  a.back { color: #666; font-size: 14px; text-decoration: none; }
  a.back:hover { color: #1a1a1a; }
  .header-bar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
  .btn { display: inline-block; padding: 8px 16px; background: #2563eb; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 13px; text-decoration: none; }
  .btn:hover { background: #1d4ed8; }
  .btn:disabled { opacity: 0.5; cursor: not-allowed; }
  .btn-sm { padding: 5px 10px; font-size: 12px; }
  .loader { display: inline-block; width: 14px; height: 14px; border: 2px solid #fff; border-top-color: transparent; border-radius: 50%; animation: spin 0.6s linear infinite; vertical-align: middle; margin-right: 4px; }
  @keyframes spin { to { transform: rotate(360deg); } }

  .stats-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
  .stat-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; text-align: center; }
  .stat-card.accent { border-color: #10b981; background: #f0fdf4; }
  .stat-card.accent-gold { border-color: #f59e0b; background: #fffbeb; }
  .stat-value { font-size: 24px; font-weight: 700; }
  .stat-label { font-size: 12px; color: #666; margin-top: 4px; }

  .insights { display: flex; flex-direction: column; gap: 8px; }
  .insight { padding: 10px 14px; background: #f0f4ff; border-left: 3px solid #2563eb; border-radius: 4px; font-size: 13px; display: flex; align-items: flex-start; gap: 10px; }
  .insight-icon { background: #2563eb; color: white; border-radius: 50%; width: 22px; height: 22px; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 700; flex-shrink: 0; }

  .data-table { width: 100%; border-collapse: collapse; font-size: 13px; }
  .data-table th { background: #f8fafc; padding: 8px 10px; text-align: left; font-weight: 600; border-bottom: 2px solid #e2e8f0; white-space: nowrap; }
  .data-table td { padding: 8px 10px; border-bottom: 1px solid #f1f5f9; vertical-align: top; }
  .data-table tr:hover td { background: #f8fafc; }
  .data-table a { color: #2563eb; text-decoration: none; }
  .data-table a:hover { text-decoration: underline; }
  .art-count { font-size: 11px; color: #999; }

  .score-bar { background: #e5e7eb; border-radius: 4px; height: 22px; position: relative; min-width: 100px; }
  .score-fill { background: linear-gradient(90deg, #2563eb, #10b981); height: 100%; border-radius: 4px; transition: width 0.3s; }
  .score-bar span { position: absolute; right: 6px; top: 2px; font-size: 12px; font-weight: 600; color: #1a1a1a; }

  .top-art { font-size: 12px; margin-bottom: 4px; }
  .top-art .meta { color: #999; font-size: 11px; }

  .badge { display: inline-block; padding: 2px 8px; border-radius: 10px; font-size: 11px; background: #e5e7eb; }

  .config-form { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; }
  .config-row { display: flex; gap: 16px; margin-bottom: 12px; flex-wrap: wrap; }
  .config-row label { display: flex; flex-direction: column; gap: 4px; font-size: 13px; color: #666; }
  .config-row input, .config-row select { padding: 6px 10px; border: 1px solid #d1d5db; border-radius: 4px; font-size: 13px; width: 140px; }

  @media (max-width: 768px) {
    .stats-grid { grid-template-columns: repeat(2, 1fr); }
    .data-table { font-size: 12px; }
    .config-row { flex-direction: column; }
  }
</style>
</head>
<body>
<a href="/" class="back">&larr; Retour</a>
<h1>${title}</h1>
${body}
</body></html>`;
}
