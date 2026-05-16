const elements = {
  board: document.getElementById('kanbanBoard'),
  total: document.getElementById('atelierTotal'),
  retards: document.getElementById('atelierRetards'),
  attentions: document.getElementById('atelierAttentions'),
  refresh: document.getElementById('btnRefreshAtelier')
};

document.addEventListener('DOMContentLoaded', () => {
  chargerAtelier();
  elements.refresh.addEventListener('click', chargerAtelier);
});

async function chargerAtelier() {
  elements.refresh.disabled = true;
  elements.refresh.textContent = 'Chargement...';

  try {
    const response = await fetch('/api/reparations/atelier');
    const data = await response.json();
    if (!response.ok) throw new Error(data.erreur || 'Erreur lors du chargement atelier');

    elements.total.textContent = data.total || 0;
    elements.retards.textContent = data.sla && data.sla.retards || 0;
    elements.attentions.textContent = data.sla && data.sla.attentions || 0;
    afficherKanban(data.colonnes || []);
  } catch (err) {
    console.error('Erreur atelier :', err);
    elements.board.innerHTML = '<p class="empty-chart">Erreur lors du chargement atelier.</p>';
  } finally {
    elements.refresh.disabled = false;
    elements.refresh.textContent = 'Actualiser';
  }
}

function afficherKanban(colonnes) {
  elements.board.innerHTML = '';

  if (!colonnes.length) {
    elements.board.innerHTML = '<p class="empty-chart">Aucune colonne atelier disponible.</p>';
    return;
  }

  colonnes.forEach(colonne => {
    const section = document.createElement('section');
    section.className = 'kanban-column';
    section.innerHTML = `
      <header class="kanban-column-header">
        <h2>${echapperHtml(colonne.libelle)}</h2>
        <span>${(colonne.reparations || []).length}</span>
      </header>
      <div class="kanban-column-body">
        ${afficherCartes(colonne.reparations || [])}
      </div>
    `;
    elements.board.appendChild(section);
  });
}

function afficherCartes(reparations) {
  if (!reparations.length) {
    return '<p class="kanban-empty">Aucune reparation.</p>';
  }

  return reparations
    .slice()
    .sort((a, b) => comparerSla(a.sla, b.sla) || new Date(a.date) - new Date(b.date))
    .map(reparation => {
      const produit = reparation.produit || {};
      const client = reparation.client || produit.clientId || {};
      const lien = produit._id
        ? `/reparation/reparation.html?id=${encodeURIComponent(reparation._id)}&produit=${encodeURIComponent(produit._id)}`
        : `/reparation/reparation.html?id=${encodeURIComponent(reparation._id)}`;

      return `
        <article class="kanban-card kanban-card-${classeSla(reparation.sla)}">
          <a href="${lien}">
            <strong>${echapperHtml(formatProduit(produit))}</strong>
            <span>${echapperHtml(formatClient(client))}</span>
            <small>${echapperHtml(formatTelephone(client.telephone))}</small>
            <div class="kanban-card-footer">
              <span>${formatDate(reparation.date)}</span>
              ${formatSla(reparation.sla)}
            </div>
          </a>
        </article>
      `;
    })
    .join('');
}

function comparerSla(a = {}, b = {}) {
  const rang = { retard: 0, attention: 1, ok: 2 };
  return (rang[a.criticite] ?? 2) - (rang[b.criticite] ?? 2)
    || Number(a.heuresRestantes || 0) - Number(b.heuresRestantes || 0);
}

function classeSla(sla = {}) {
  if (sla.criticite === 'retard') return 'retard';
  if (sla.criticite === 'attention') return 'attention';
  return 'ok';
}

function formatSla(sla = {}) {
  if (!sla.actif) return '<em>SLA -</em>';
  const libelle = sla.criticite === 'retard' ? 'Retard' : sla.criticite === 'attention' ? 'Attention' : 'OK';
  return `<em class="kanban-sla kanban-sla-${classeSla(sla)}">${libelle}</em>`;
}

function formatProduit(produit) {
  return [produit.nom, produit.model, produit.imei].filter(Boolean).join(' - ') || 'Produit inconnu';
}

function formatClient(client) {
  return [client.nom, client.prenom].filter(Boolean).join(' ') || 'Client inconnu';
}

function formatTelephone(telephone) {
  return telephone || '';
}

function formatDate(valeur) {
  if (!valeur) return '-';
  const date = new Date(valeur);
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleDateString('fr-CA');
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
