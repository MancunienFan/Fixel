const elements = {
  produitsDisponibles: document.getElementById('produitsDisponibles'),
  produitsVendus: document.getElementById('produitsVendus'),
  reparationsActives: document.getElementById('reparationsActives'),
  facturesImpayees: document.getElementById('facturesImpayees'),
  caMois: document.getElementById('caMois'),
  profitTotalDashboard: document.getElementById('profitTotalDashboard'),
  caTotal: document.getElementById('caTotal'),
  facturesPayeesMontant: document.getElementById('facturesPayeesMontant'),
  facturesImpayeesMontant: document.getElementById('facturesImpayeesMontant'),
  stockAlertes: document.getElementById('stockAlertes'),
  reparationsBody: document.getElementById('reparationsDashboardBody'),
  facturesBody: document.getElementById('facturesDashboardBody'),
  ventesProfitChart: document.getElementById('ventesProfitChart'),
  reparationsStatutChart: document.getElementById('reparationsStatutChart'),
  facturesStatutChart: document.getElementById('facturesStatutChart'),
  stockStatutChart: document.getElementById('stockStatutChart'),
  btnRefresh: document.getElementById('btnRefreshDashboard')
};

document.addEventListener('DOMContentLoaded', () => {
  chargerDashboard();
  elements.btnRefresh.addEventListener('click', chargerDashboard);
});

async function chargerDashboard() {
  elements.btnRefresh.disabled = true;
  elements.btnRefresh.textContent = 'Chargement...';

  try {
    const response = await fetch('/api/dashboard/stats');
    const data = await response.json();

    if (!response.ok) throw new Error(data.error || 'Erreur lors du chargement du tableau de bord');

    afficherIndicateurs(data);
    afficherAlertesStock(data.produits);
    afficherGraphiques(data.graphiques || {});
    afficherReparations(data.reparations.actives || []);
    afficherFactures(data.factures.dernieres || []);
  } catch (err) {
    console.error('Erreur dashboard :', err);
    elements.reparationsBody.innerHTML = '<tr><td colspan="5">Erreur lors du chargement.</td></tr>';
    elements.facturesBody.innerHTML = '<tr><td colspan="5">Erreur lors du chargement.</td></tr>';
  } finally {
    elements.btnRefresh.disabled = false;
    elements.btnRefresh.textContent = 'Actualiser';
  }
}

function afficherIndicateurs(data) {
  const reparationsActives = Number(data.reparations.enAttente || 0) + Number(data.reparations.enCours || 0);
  const facturesImpayees = Number(data.factures.emises || 0) + Number(data.factures.envoyees || 0);

  elements.produitsDisponibles.textContent = data.produits.disponibles || 0;
  elements.produitsVendus.textContent = data.produits.vendus || 0;
  elements.reparationsActives.textContent = reparationsActives;
  elements.facturesImpayees.textContent = facturesImpayees;
  elements.caMois.textContent = formatMontant(data.finance.chiffreAffairesMois);
  elements.profitTotalDashboard.textContent = formatMontant(data.finance.profitTotal);
  elements.caTotal.textContent = formatMontant(data.finance.chiffreAffaires);
  elements.facturesPayeesMontant.textContent = formatMontant(data.factures.totalPaye);
  elements.facturesImpayeesMontant.textContent = formatMontant(data.factures.totalImpaye);
}

function afficherAlertesStock(produits) {
  const alertes = [
    `${produits.pourPieces || 0} produit(s) pour pieces`,
    `${produits.sansImei || 0} produit(s) sans IMEI`,
    `${produits.sansPrixVente || 0} produit(s) sans prix de vente`
  ];

  elements.stockAlertes.innerHTML = alertes
    .map(alerte => `<li>${alerte}</li>`)
    .join('');
}

function afficherGraphiques(graphiques) {
  afficherVentesProfit(graphiques.ventesParMois || []);
  afficherBarresStatut(elements.reparationsStatutChart, graphiques.reparationsParStatut || []);
  afficherBarresStatut(elements.facturesStatutChart, graphiques.facturesParStatut || []);
  afficherBarresStatut(elements.stockStatutChart, graphiques.stockParStatut || []);
}

function afficherVentesProfit(mois) {
  elements.ventesProfitChart.innerHTML = '';

  if (!mois.length) {
    elements.ventesProfitChart.innerHTML = '<p class="empty-chart">Aucune donnee disponible.</p>';
    return;
  }

  const maximum = Math.max(
    ...mois.map(item => Number(item.chiffreAffaires || 0)),
    ...mois.map(item => Number(item.profit || 0)),
    1
  );

  mois.forEach(item => {
    const ca = Number(item.chiffreAffaires || 0);
    const profit = Math.max(Number(item.profit || 0), 0);
    const colonne = document.createElement('div');
    colonne.className = 'chart-month';
    colonne.innerHTML = `
      <div class="chart-bars">
        <span class="bar bar-ca" style="height:${hauteurBarre(ca, maximum)}%" title="CA: ${formatMontant(ca)}"></span>
        <span class="bar bar-profit" style="height:${hauteurBarre(profit, maximum)}%" title="Profit: ${formatMontant(profit)}"></span>
      </div>
      <strong>${echapperHtml(item.label || '')}</strong>
      <small>${formatMontant(ca)}</small>
    `;

    elements.ventesProfitChart.appendChild(colonne);
  });
}

function afficherBarresStatut(container, donnees) {
  container.innerHTML = '';

  if (!donnees.length) {
    container.innerHTML = '<p class="empty-chart">Aucune donnee disponible.</p>';
    return;
  }

  const maximum = Math.max(...donnees.map(item => Number(item.valeur || 0)), 1);

  donnees.forEach(item => {
    const valeur = Number(item.valeur || 0);
    const ligne = document.createElement('div');
    ligne.className = 'status-chart-row';
    ligne.innerHTML = `
      <div class="status-chart-label">
        <span>${echapperHtml(item.label || '-')}</span>
        <strong>${valeur}</strong>
      </div>
      <div class="status-chart-track">
        <span style="width:${largeurBarre(valeur, maximum)}%"></span>
      </div>
    `;

    container.appendChild(ligne);
  });
}

function hauteurBarre(valeur, maximum) {
  if (!valeur) return 3;
  return Math.max((valeur / maximum) * 100, 6);
}

function largeurBarre(valeur, maximum) {
  if (!valeur) return 2;
  return Math.max((valeur / maximum) * 100, 6);
}

function afficherReparations(reparations) {
  elements.reparationsBody.innerHTML = '';

  if (!reparations.length) {
    elements.reparationsBody.innerHTML = '<tr><td colspan="5">Aucune reparation active.</td></tr>';
    return;
  }

  reparations.forEach(reparation => {
    const produit = reparation.produit || {};
    const client = reparation.client || produit.clientId || {};
    const tr = document.createElement('tr');
    const lien = produit._id
      ? `/reparation/reparation.html?id=${reparation._id}&produit=${produit._id}`
      : '#';

    tr.innerHTML = `
      <td>${echapperHtml(formatProduit(produit))}</td>
      <td>${echapperHtml(formatClient(client))}</td>
      <td>${formatDate(reparation.date)}</td>
      <td>${echapperHtml(reparation.statut || '-')}</td>
      <td><a class="table-link-button" href="${lien}">Ouvrir</a></td>
    `;

    elements.reparationsBody.appendChild(tr);
  });
}

function afficherFactures(factures) {
  elements.facturesBody.innerHTML = '';

  if (!factures.length) {
    elements.facturesBody.innerHTML = '<tr><td colspan="5">Aucune facture recente.</td></tr>';
    return;
  }

  factures.forEach(facture => {
    const tr = document.createElement('tr');
    const client = facture.client || {};
    const total = facture.totalTTC || facture.totalHT || 0;

    tr.innerHTML = `
      <td>${formatNumeroFacture(facture.numeroFacture)}</td>
      <td>${echapperHtml(formatClient(client))}</td>
      <td>${formatMontant(total)}</td>
      <td>${echapperHtml(facture.statut || '-')}</td>
      <td><a class="table-link-button" href="/api/factures/${facture._id}/pdf?inclureTaxes=${facture.inclureTaxes ? 'true' : 'false'}">PDF</a></td>
    `;

    elements.facturesBody.appendChild(tr);
  });
}

function formatProduit(produit) {
  return [produit.nom, produit.model, produit.imei].filter(Boolean).join(' - ') || '-';
}

function formatClient(client) {
  return [client.nom, client.prenom].filter(Boolean).join(' ') || '-';
}

function formatNumeroFacture(numero) {
  return numero ? `#${String(numero).padStart(4, '0')}` : '-';
}

function formatDate(valeur) {
  if (!valeur) return '-';
  const date = new Date(valeur);
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleDateString('fr-CA');
}

function formatMontant(valeur) {
  return `${Number(valeur || 0).toFixed(2)} $`;
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
