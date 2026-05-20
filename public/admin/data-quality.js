const token = localStorage.getItem('token');
const role = localStorage.getItem('role');

if (!token || role !== 'admin') {
  alert('Acces reserve aux administrateurs.');
  window.location.href = '/login/login.html';
}

const state = {
  issues: []
};

const elements = {
  btnRefresh: document.getElementById('btnRefreshDataQuality'),
  btnReset: document.getElementById('btnResetDataQuality'),
  issuesCount: document.getElementById('issuesCount'),
  correctionsCount: document.getElementById('correctionsCount'),
  generatedAt: document.getElementById('generatedAt'),
  visibleIssuesCount: document.getElementById('visibleIssuesCount'),
  entityFilter: document.getElementById('entityFilter'),
  codeFilter: document.getElementById('codeFilter'),
  searchFilter: document.getElementById('searchFilter'),
  tbody: document.querySelector('#dataQualityTable tbody')
};

document.addEventListener('DOMContentLoaded', () => {
  chargerRapport();
  elements.btnRefresh.addEventListener('click', chargerRapport);
  elements.btnReset.addEventListener('click', reinitialiserFiltres);
  elements.entityFilter.addEventListener('change', afficherIssues);
  elements.codeFilter.addEventListener('change', afficherIssues);
  elements.searchFilter.addEventListener('input', afficherIssues);
});

async function chargerRapport() {
  elements.btnRefresh.disabled = true;
  elements.btnRefresh.textContent = 'Chargement...';
  elements.tbody.innerHTML = '<tr><td colspan="5">Chargement du diagnostic...</td></tr>';

  try {
    const response = await fetch('/api/data-quality');
    const rapport = await response.json();

    if (!response.ok) {
      throw new Error(rapport.erreur || 'Diagnostic impossible.');
    }

    state.issues = rapport.issues || [];
    elements.issuesCount.textContent = rapport.summary?.issues || 0;
    elements.correctionsCount.textContent = rapport.summary?.correctionsDisponibles || 0;
    elements.generatedAt.textContent = formatHeure(rapport.generatedAt);

    remplirFiltres(state.issues);
    afficherIssues();
  } catch (err) {
    elements.tbody.innerHTML = `<tr><td colspan="5">${echapperHtml(err.message)}</td></tr>`;
  } finally {
    elements.btnRefresh.disabled = false;
    elements.btnRefresh.textContent = 'Actualiser';
  }
}

function remplirFiltres(issues) {
  const entiteActuelle = elements.entityFilter.value;
  const codeActuel = elements.codeFilter.value;

  remplirSelect(elements.entityFilter, valeursUniques(issues.map(issue => issue.entity)), entiteActuelle);
  remplirSelect(elements.codeFilter, valeursUniques(issues.map(issue => issue.code)), codeActuel);
}

function remplirSelect(select, valeurs, valeurActuelle) {
  select.innerHTML = '<option value="">Tous</option>';
  valeurs.forEach(valeur => {
    const option = document.createElement('option');
    option.value = valeur;
    option.textContent = valeur;
    select.appendChild(option);
  });
  select.value = valeurs.includes(valeurActuelle) ? valeurActuelle : '';
}

function afficherIssues() {
  const entity = elements.entityFilter.value;
  const code = elements.codeFilter.value;
  const recherche = normaliser(elements.searchFilter.value);

  const issues = state.issues.filter(issue => {
    if (entity && issue.entity !== entity) return false;
    if (code && issue.code !== code) return false;
    if (!recherche) return true;

    return [
      issue.entity,
      issue.code,
      issue.entityId,
      issue.message
    ].some(valeur => normaliser(valeur).includes(recherche));
  });

  elements.visibleIssuesCount.textContent = issues.length;
  elements.tbody.innerHTML = '';

  if (!issues.length) {
    elements.tbody.innerHTML = '<tr><td colspan="5">Aucun probleme pour ces filtres.</td></tr>';
    return;
  }

  issues.forEach(issue => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${echapperHtml(issue.entity)}</td>
      <td><code>${echapperHtml(issue.code)}</code></td>
      <td><code>${echapperHtml(issue.entityId)}</code></td>
      <td>${echapperHtml(issue.message)}</td>
      <td>${construireLienAction(issue)}</td>
    `;
    elements.tbody.appendChild(tr);
  });
}

function construireLienAction(issue) {
  if (issue.entity === 'client' && estObjectId(issue.entityId)) {
    return `<a class="table-link-button" href="/client/client.html?id=${encodeURIComponent(issue.entityId)}">Ouvrir</a>`;
  }

  if (issue.entity === 'produit' && estObjectId(issue.entityId)) {
    return `<a class="table-link-button" href="/produit/produit.html?id=${encodeURIComponent(issue.entityId)}">Ouvrir</a>`;
  }

  if (issue.entity === 'reparation' && estObjectId(issue.entityId)) {
    return `<a class="table-link-button" href="/reparation/reparation.html?id=${encodeURIComponent(issue.entityId)}">Ouvrir</a>`;
  }

  if (issue.entity === 'facture') {
    return '<a class="table-link-button" href="/facture/facture.html">Factures</a>';
  }

  return '-';
}

function reinitialiserFiltres() {
  elements.entityFilter.value = '';
  elements.codeFilter.value = '';
  elements.searchFilter.value = '';
  afficherIssues();
}

function valeursUniques(valeurs) {
  return [...new Set(valeurs.filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function estObjectId(valeur) {
  return /^[a-f\d]{24}$/i.test(valeur || '');
}

function normaliser(valeur) {
  return (valeur || '').toString().toLowerCase().trim();
}

function formatHeure(valeur) {
  if (!valeur) return '-';
  const date = new Date(valeur);
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleString('fr-CA');
}

function echapperHtml(valeur) {
  return (valeur || '')
    .toString()
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
