export function wizardPage(): string {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Ecrire un article — Veille FAL</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, sans-serif; max-width: 800px; margin: 40px auto; padding: 20px; color: #1a1a1a; }
  h1 { font-size: 22px; margin: 0 0 8px 0; }
  h2 { font-size: 18px; margin: 24px 0 12px 0; }
  .subtitle { color: #666; font-size: 14px; margin: 0 0 24px 0; }
  .step { display: none; }
  .step.active { display: block; }
  .steps-bar { display: flex; gap: 8px; margin-bottom: 24px; }
  .steps-bar span { padding: 6px 14px; border-radius: 20px; font-size: 13px; background: #e5e7eb; color: #666; }
  .steps-bar span.active { background: #2563eb; color: white; }
  .steps-bar span.done { background: #10b981; color: white; }
  textarea, input[type="text"], input[type="url"] { width: 100%; padding: 10px 12px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 14px; font-family: inherit; }
  textarea { min-height: 120px; resize: vertical; }
  .btn { display: inline-block; padding: 10px 20px; background: #2563eb; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 14px; text-decoration: none; }
  .btn:hover { background: #1d4ed8; }
  .btn:disabled { opacity: 0.5; cursor: not-allowed; }
  .btn-secondary { background: #6b7280; }
  .btn-secondary:hover { background: #4b5563; }
  .btn-success { background: #10b981; }
  .btn-success:hover { background: #059669; }
  .btn-sm { padding: 5px 10px; font-size: 12px; }
  .btn-danger { background: #ef4444; }
  .loader { display: inline-block; width: 18px; height: 18px; border: 2px solid #fff; border-top-color: transparent; border-radius: 50%; animation: spin 0.6s linear infinite; vertical-align: middle; margin-right: 6px; }
  @keyframes spin { to { transform: rotate(360deg); } }
  .source-item { padding: 10px 12px; border: 1px solid #e5e7eb; border-radius: 6px; margin-bottom: 8px; display: flex; gap: 10px; align-items: flex-start; }
  .source-item label { flex: 1; cursor: pointer; }
  .source-item .title { font-weight: 600; font-size: 14px; }
  .source-item .url { color: #2563eb; font-size: 12px; word-break: break-all; }
  .source-item .snippet { color: #666; font-size: 12px; margin-top: 4px; }
  .answer-box { background: #f0f4ff; border-left: 4px solid #2563eb; padding: 12px 16px; border-radius: 4px; margin-bottom: 16px; font-size: 14px; color: #374151; }
  .add-row { display: flex; gap: 8px; margin-bottom: 8px; }
  .add-row input { flex: 1; }
  .plan-section { padding: 12px; border: 1px solid #e5e7eb; border-radius: 6px; margin-bottom: 8px; }
  .plan-section input { margin-bottom: 6px; font-weight: 600; }
  .plan-section textarea { min-height: 60px; }
  .plan-actions { display: flex; gap: 6px; margin-top: 6px; }
  .error { background: #fef2f2; border: 1px solid #fecaca; color: #991b1b; padding: 12px; border-radius: 6px; margin-bottom: 12px; }
  .success-box { text-align: center; padding: 40px 20px; }
  .success-box h2 { color: #10b981; }
  a.back { color: #666; font-size: 14px; text-decoration: none; }
  a.back:hover { color: #1a1a1a; }
</style>
</head>
<body>
<a href="/" class="back">&larr; Retour</a>
<h1>Ecrire un article</h1>
<p class="subtitle">Recherche de sources, plan, puis creation du brouillon Ghost</p>

<div class="steps-bar">
  <span id="bar1" class="active">1. Sujet</span>
  <span id="bar2">2. Sources</span>
  <span id="bar3">3. Plan</span>
  <span id="bar4">4. Termine</span>
</div>

<div id="error" class="error" style="display:none;"></div>

<!-- STEP 1: Instructions -->
<div id="step1" class="step active">
  <h2>Quel sujet voulez-vous traiter ?</h2>
  <textarea id="instructions" placeholder="Decrivez le sujet, l'angle souhaite, les points a couvrir...&#10;&#10;Exemple : Nouvelles regles pour les visas de travail UK en 2026. Impact sur les Francais. Comparer avec les regles precedentes."></textarea>
  <br><br>
  <button class="btn" onclick="doResearch()">Rechercher des sources</button>
</div>

<!-- STEP 2: Sources -->
<div id="step2" class="step">
  <h2>Sources trouvees</h2>
  <div id="answer"></div>
  <div id="sourcesList"></div>
  <h3 style="font-size:15px; margin-top:20px;">Ajouter des sources</h3>
  <div class="add-row">
    <input type="url" id="addUrl" placeholder="Coller une URL...">
    <button class="btn btn-sm" onclick="doAddUrl()">+ URL</button>
  </div>
  <div class="add-row">
    <input type="text" id="addKeyword" placeholder="Recherche supplementaire...">
    <button class="btn btn-sm btn-secondary" onclick="doSearchMore()">Rechercher</button>
  </div>
  <br>
  <button class="btn" onclick="doGeneratePlan()">Generer le plan</button>
  <button class="btn btn-secondary" onclick="goToStep(1)" style="margin-left:8px;">Modifier les instructions</button>
</div>

<!-- STEP 3: Plan -->
<div id="step3" class="step">
  <h2>Plan de l'article</h2>
  <label style="font-size:13px; color:#666;">Titre</label>
  <input type="text" id="planTitle">
  <br><br>
  <label style="font-size:13px; color:#666;">Slug SEO</label>
  <input type="text" id="planSlug">
  <br><br>
  <label style="font-size:13px; color:#666;">Angle editorial</label>
  <input type="text" id="planAngle">
  <br><br>
  <label style="font-size:13px; color:#666;">Sections</label>
  <div id="planSections"></div>
  <button class="btn btn-sm btn-secondary" onclick="addSection()" style="margin-top:8px;">+ Ajouter une section</button>
  <br><br>
  <button class="btn btn-success" onclick="doCreateDraft()">Creer le brouillon</button>
  <button class="btn btn-secondary" onclick="doReplan()" style="margin-left:8px;">Regenerer le plan</button>
  <button class="btn btn-secondary" onclick="goToStep(2)" style="margin-left:8px;">Modifier les sources</button>
</div>

<!-- STEP 4: Done -->
<div id="step4" class="step">
  <div class="success-box">
    <h2>Brouillon cree !</h2>
    <p id="draftTitle"></p>
    <a id="draftLink" href="#" class="btn btn-success" target="_blank">Ouvrir dans Ghost</a>
    <br><br>
    <button class="btn btn-secondary" onclick="resetWizard()">Ecrire un autre article</button>
  </div>
</div>

<script>
let state = { instructions: '', sources: [], plan: null };

function showError(msg) {
  const el = document.getElementById('error');
  el.textContent = msg;
  el.style.display = msg ? 'block' : 'none';
}

function goToStep(n) {
  showError('');
  document.querySelectorAll('.step').forEach(s => s.classList.remove('active'));
  document.getElementById('step' + n).classList.add('active');
  for (let i = 1; i <= 4; i++) {
    const bar = document.getElementById('bar' + i);
    bar.className = i < n ? 'done' : i === n ? 'active' : '';
  }
}

function setLoading(btn, loading) {
  if (loading) {
    btn.disabled = true;
    btn.dataset.text = btn.textContent;
    btn.innerHTML = '<span class="loader"></span>En cours...';
  } else {
    btn.disabled = false;
    btn.textContent = btn.dataset.text;
  }
}

async function api(path, body) {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || 'Erreur serveur');
  }
  return res.json();
}

// --- Step 1 -> 2: Research ---
async function doResearch() {
  const btn = event.target;
  const instructions = document.getElementById('instructions').value.trim();
  if (!instructions) return showError('Veuillez entrer un sujet');
  state.instructions = instructions;
  setLoading(btn, true);
  showError('');
  try {
    const data = await api('/api/research', { instructions });
    state.sources = data.sources.map(s => ({ ...s, selected: true }));
    renderSources(data.answer);
    goToStep(2);
  } catch (e) { showError(e.message); }
  setLoading(btn, false);
}

function renderSources(answer) {
  if (answer) {
    document.getElementById('answer').innerHTML = '<div class="answer-box">' + answer + '</div>';
  }
  const list = document.getElementById('sourcesList');
  list.innerHTML = state.sources.map((s, i) => {
    const checked = s.selected ? 'checked' : '';
    return '<div class="source-item">' +
      '<input type="checkbox" ' + checked + ' onchange="state.sources[' + i + '].selected=this.checked" style="margin-top:3px;">' +
      '<label onclick="this.previousElementSibling.click()">' +
      '<div class="title">' + esc(s.title) + '</div>' +
      '<div class="url">' + esc(s.url) + '</div>' +
      '<div class="snippet">' + esc(s.content.slice(0, 200)) + '</div>' +
      '</label>' +
      '<button class="btn btn-sm btn-danger" onclick="state.sources.splice(' + i + ',1);renderSources()">x</button>' +
      '</div>';
  }).join('');
}

// --- Add URL ---
async function doAddUrl() {
  const input = document.getElementById('addUrl');
  const url = input.value.trim();
  if (!url) return;
  const btn = event.target;
  setLoading(btn, true);
  try {
    const data = await api('/api/extract-url', { urls: [url] });
    for (const s of data.sources) {
      state.sources.push({ ...s, selected: true });
    }
    if (data.sources.length === 0) {
      state.sources.push({ title: new URL(url).hostname, url, content: '', selected: true });
    }
    renderSources();
    input.value = '';
  } catch (e) { showError(e.message); }
  setLoading(btn, false);
}

// --- Search more ---
async function doSearchMore() {
  const input = document.getElementById('addKeyword');
  const query = input.value.trim();
  if (!query) return;
  const btn = event.target;
  setLoading(btn, true);
  try {
    const data = await api('/api/research-more', { query });
    const existing = new Set(state.sources.map(s => s.url));
    for (const s of data.sources) {
      if (!existing.has(s.url)) {
        state.sources.push({ ...s, selected: true });
      }
    }
    renderSources();
    input.value = '';
  } catch (e) { showError(e.message); }
  setLoading(btn, false);
}

// --- Step 2 -> 3: Generate plan ---
async function doGeneratePlan() {
  const btn = event.target;
  const selected = state.sources.filter(s => s.selected);
  if (selected.length === 0) return showError('Selectionnez au moins une source');
  setLoading(btn, true);
  showError('');
  try {
    const data = await api('/api/plan', { instructions: state.instructions, sources: selected });
    state.plan = data;
    renderPlan();
    goToStep(3);
  } catch (e) { showError(e.message); }
  setLoading(btn, false);
}

function renderPlan() {
  document.getElementById('planTitle').value = state.plan.title;
  document.getElementById('planSlug').value = state.plan.slug;
  document.getElementById('planAngle').value = state.plan.angle;
  renderSections();
}

function renderSections() {
  const container = document.getElementById('planSections');
  container.innerHTML = state.plan.sections.map((s, i) => {
    return '<div class="plan-section">' +
      '<input type="text" value="' + esc(s.heading) + '" onchange="state.plan.sections[' + i + '].heading=this.value">' +
      '<textarea onchange="state.plan.sections[' + i + '].description=this.value">' + esc(s.description) + '</textarea>' +
      '<div class="plan-actions">' +
      (i > 0 ? '<button class="btn btn-sm btn-secondary" onclick="moveSection(' + i + ',-1)">&#8593;</button>' : '') +
      (i < state.plan.sections.length - 1 ? '<button class="btn btn-sm btn-secondary" onclick="moveSection(' + i + ',1)">&#8595;</button>' : '') +
      '<button class="btn btn-sm btn-danger" onclick="removeSection(' + i + ')">Supprimer</button>' +
      '</div></div>';
  }).join('');
}

function moveSection(i, dir) {
  const s = state.plan.sections;
  const j = i + dir;
  [s[i], s[j]] = [s[j], s[i]];
  renderSections();
}

function removeSection(i) {
  state.plan.sections.splice(i, 1);
  renderSections();
}

function addSection() {
  state.plan.sections.push({ heading: 'Nouvelle section', description: '' });
  renderSections();
}

// --- Replan ---
async function doReplan() {
  const btn = event.target;
  // Sync plan from UI
  state.plan.title = document.getElementById('planTitle').value;
  state.plan.slug = document.getElementById('planSlug').value;
  state.plan.angle = document.getElementById('planAngle').value;
  const feedback = 'Le plan actuel est : ' + JSON.stringify(state.plan.sections.map(s => s.heading)) +
    '. Titre actuel : ' + state.plan.title + '. Angle : ' + state.plan.angle +
    '. Regenere un nouveau plan en gardant les memes sources mais en proposant un angle different ou une meilleure structure.';
  const selected = state.sources.filter(s => s.selected);
  setLoading(btn, true);
  showError('');
  try {
    const data = await api('/api/plan', { instructions: state.instructions, sources: selected, feedback });
    state.plan = data;
    renderPlan();
  } catch (e) { showError(e.message); }
  setLoading(btn, false);
}

// --- Step 3 -> 4: Create draft ---
async function doCreateDraft() {
  const btn = event.target;
  // Sync plan from UI
  state.plan.title = document.getElementById('planTitle').value;
  state.plan.slug = document.getElementById('planSlug').value;
  state.plan.angle = document.getElementById('planAngle').value;
  const selected = state.sources.filter(s => s.selected);
  setLoading(btn, true);
  showError('');
  try {
    const data = await api('/api/create-draft', {
      instructions: state.instructions,
      plan: state.plan,
      sources: selected,
    });
    document.getElementById('draftTitle').textContent = data.title;
    document.getElementById('draftLink').href = data.ghostEditorUrl;
    goToStep(4);
  } catch (e) { showError(e.message); }
  setLoading(btn, false);
}

function resetWizard() {
  state = { instructions: '', sources: [], plan: null };
  document.getElementById('instructions').value = '';
  document.getElementById('answer').innerHTML = '';
  document.getElementById('sourcesList').innerHTML = '';
  goToStep(1);
}

function esc(s) {
  const d = document.createElement('div');
  d.textContent = s || '';
  return d.innerHTML;
}
</script>
</body></html>`;
}
