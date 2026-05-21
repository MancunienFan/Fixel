const elements = {
  produitsDisponibles: document.getElementById('produitsDisponibles'),
  produitsVendus: document.getElementById('produitsVendus'),
  reparationsActives: document.getElementById('reparationsActives'),
  reparationsAFaire: document.getElementById('reparationsAFaire'),
  reparationsEnAttente: document.getElementById('reparationsEnAttente'),
  reparationsEnCours: document.getElementById('reparationsEnCours'),
  reparationsTerminees: document.getElementById('reparationsTerminees'),
  facturesImpayees: document.getElementById('facturesImpayees'),
  slaRetards: document.getElementById('slaRetards'),
  slaAttentions: document.getElementById('slaAttentions'),
  caMois: document.getElementById('caMois'),
  profitTotalDashboard: document.getElementById('profitTotalDashboard'),
  savRetoursMois: document.getElementById('savRetoursMois'),
  savOuverts: document.getElementById('savOuverts'),
  savResolus: document.getElementById('savResolus'),
  savCoutMois: document.getElementById('savCoutMois'),
  savRefuses: document.getElementById('savRefuses'),
  savCoutTotal: document.getElementById('savCoutTotal'),
  savModeles: document.getElementById('savModeles'),
  caTotal: document.getElementById('caTotal'),
  revenusVentesMois: document.getElementById('revenusVentesMois'),
  revenusReparationsMois: document.getElementById('revenusReparationsMois'),
  profitVentesMois: document.getElementById('profitVentesMois'),
  profitReparationsMois: document.getElementById('profitReparationsMois'),
  facturesImpayeesMontant: document.getElementById('facturesImpayeesMontant'),
  stockAlertes: document.getElementById('stockAlertes'),
  slaAlertes: document.getElementById('slaAlertes'),
  reparationsBody: document.getElementById('reparationsDashboardBody'),
  facturesBody: document.getElementById('facturesDashboardBody'),
  filtrePeriode: document.getElementById('filtrePeriodeDashboard'),
  filtreMois: document.getElementById('filtreMoisDashboard'),
  filtreAnnee: document.getElementById('filtreAnneeDashboard'),
  labelProduitsVendus: document.getElementById('labelProduitsVendus'),
  labelCaPeriode: document.getElementById('labelCaPeriode'),
  labelProfitPeriode: document.getElementById('labelProfitPeriode'),
  titreFinancePeriode: document.getElementById('titreFinancePeriode'),
  ventesProfitChart: document.getElementById('ventesProfitChart'),
  reparationsProfitChart: document.getElementById('reparationsProfitChart'),
  reparationsStatutChart: document.getElementById('reparationsStatutChart'),
  facturesStatutChart: document.getElementById('facturesStatutChart'),
  stockStatutChart: document.getElementById('stockStatutChart'),
  btnRefresh: document.getElementById('btnRefreshDashboard')
};

document.addEventListener('DOMContentLoaded', () => {
  initialiserFiltrePeriode();
  chargerDashboard();
  elements.btnRefresh.addEventListener('click', chargerDashboard);
  elements.filtrePeriode.addEventListener('change', () => {
    synchroniserFiltrePeriode();
    chargerDashboard();
  });
  elements.filtreMois.addEventListener('change', chargerDashboard);
  elements.filtreAnnee.addEventListener('change', chargerDashboard);
});

function initialiserFiltrePeriode() {
  const maintenant = new Date();
  const mois = [
    'Janvier',
    'Fevrier',
    'Mars',
    'Avril',
    'Mai',
    'Juin',
    'Juillet',
    'Aout',
    'Septembre',
    'Octobre',
    'Novembre',
    'Decembre'
  ];

  elements.filtreMois.innerHTML = mois
    .map((label, index) => `<option value="${index + 1}">${label}</option>`)
    .join('');
  elements.filtreMois.value = String(maintenant.getMonth() + 1);
  elements.filtreAnnee.value = String(maintenant.getFullYear());
  synchroniserFiltrePeriode();
}

function synchroniserFiltrePeriode() {
  const modeAnnee = elements.filtrePeriode.value === 'annee';
  elements.filtreMois.disabled = modeAnnee;
  elements.labelProduitsVendus.textContent = modeAnnee ? 'Produits vendus cette annee' : 'Produits vendus ce mois';
  elements.labelCaPeriode.textContent = modeAnnee ? "CA de l'annee" : 'CA du mois';
  elements.labelProfitPeriode.textContent = modeAnnee ? "Profit de l'annee" : 'Profit du mois';
  elements.titreFinancePeriode.textContent = modeAnnee ? "Finance de l'annee" : 'Finance du mois';
}

async function chargerDashboard() {
  elements.btnRefresh.disabled = true;
  elements.btnRefresh.textContent = 'Chargement...';

  try {
    const params = new URLSearchParams({
      periode: elements.filtrePeriode.value,
      mois: elements.filtreMois.value,
      annee: elements.filtreAnnee.value
    });
    const response = await fetch(`/api/dashboard/stats?${params.toString()}`);
    const data = await response.json();

    if (!response.ok) throw new Error(data.error || 'Erreur lors du chargement du tableau de bord');

    afficherIndicateurs(data);
    afficherAlertesStock(data.produits);
    afficherAlertesSla(data.reparations.sla || {});
    afficherGraphiques(data.graphiques || {});
    afficherReparations(data.reparations.actives || []);
    afficherFactures(data.factures.dernieres || []);
  } catch (err) {
    console.error('Erreur dashboard :', err);
    elements.reparationsBody.innerHTML = '<tr><td colspan="6">Erreur lors du chargement.</td></tr>';
    elements.facturesBody.innerHTML = '<tr><td colspan="5">Erreur lors du chargement.</td></tr>';
  } finally {
    elements.btnRefresh.disabled = false;
    elements.btnRefresh.textContent = 'Actualiser';
  }
}

function afficherIndicateurs(data) {
  const reparationsActives = Number(data.reparations.recues || 0)
    + Number(data.reparations.diagnostic || 0)
    + Number(data.reparations.attentePiece || 0)
    + Number(data.reparations.enReparation || 0)
    + Number(data.reparations.pretes || 0);

  elements.produitsDisponibles.textContent = data.produits.disponibles || 0;
  elements.produitsVendus.textContent = data.produits.vendusMois || 0;
  elements.reparationsActives.textContent = reparationsActives;
  elements.reparationsAFaire.textContent = data.reparations.aFaireMois || 0;
  elements.reparationsEnAttente.textContent = data.reparations.enAttenteMois || 0;
  elements.reparationsEnCours.textContent = data.reparations.enCoursMois || 0;
  elements.reparationsTerminees.textContent = data.reparations.termineesMois || 0;
  elements.facturesImpayees.textContent = data.factures.impayeesMois || 0;
  elements.slaRetards.textContent = data.reparations.sla && data.reparations.sla.retards || 0;
  elements.slaAttentions.textContent = data.reparations.sla && data.reparations.sla.attentions || 0;
  elements.caMois.textContent = formatMontant(data.finance.chiffreAffairesMois);
  elements.profitTotalDashboard.textContent = formatMontant(data.finance.profitMois);
  elements.revenusVentesMois.textContent = formatMontant(data.finance.chiffreAffairesVentesMois);
  elements.revenusReparationsMois.textContent = formatMontant(data.finance.chiffreAffairesReparationsMois);
  elements.caTotal.textContent = formatMontant(data.finance.chiffreAffairesMois);
  elements.profitVentesMois.textContent = formatMontant(data.finance.profitVentesMois);
  elements.profitReparationsMois.textContent = formatMontant(data.finance.profitReparationsMois);
  elements.facturesImpayeesMontant.textContent = formatMontant(data.factures.totalImpayeMois);

  const sav = data.sav || {};
  elements.savRetoursMois.textContent = sav.retoursMois || 0;
  elements.savOuverts.textContent = sav.ouverts || 0;
  elements.savResolus.textContent = sav.resolus || 0;
  elements.savCoutMois.textContent = formatMontant(sav.coutTotalMois);
  elements.savRefuses.textContent = sav.refuses || 0;
  elements.savCoutTotal.textContent = formatMontant(sav.coutTotal);
  elements.savModeles.textContent = Array.isArray(sav.modelesPlusRetournes) && sav.modelesPlusRetournes.length
    ? sav.modelesPlusRetournes.map(item => `${item.modele} (${item.total})`).join(', ')
    : '-';
}

function afficherAlertesStock(produits) {
  const alertes = [
    `${produits.pourPieces || 0} produit(s) pour pieces`,
    `${produits.sansImei || 0} produit(s) sans numero de serie`,
    `${produits.sansPrixVente || 0} produit(s) sans prix de vente`
  ];

  elements.stockAlertes.innerHTML = alertes
    .map(alerte => `<li>${alerte}</li>`)
    .join('');
}

function afficherAlertesSla(sla) {
  const alertes = sla.alertes || [];

  if (!alertes.length) {
    elements.slaAlertes.innerHTML = '<li class="alert-ok">Aucune reparation hors delai.</li>';
    return;
  }

  elements.slaAlertes.innerHTML = alertes
    .map(alerte => `
      <li class="alert-${echapperHtml(alerte.criticite)}">
        <strong>${echapperHtml(alerte.produit)}</strong>
        <span>${echapperHtml(alerte.client)} - ${echapperHtml(alerte.message)}</span>
      </li>
    `)
    .join('');
}

function afficherGraphiques(graphiques) {
  afficherVentesProfit(graphiques.ventesParMois || []);
  afficherReparationsProfit(graphiques.reparationsProfitParMois || []);
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
    const profit = Number(item.profit || 0);
    const hauteurProfit = Math.max(profit, 0);
    const colonne = document.createElement('div');
    colonne.className = 'chart-month';
    colonne.innerHTML = `
      <div class="chart-bars">
        <span class="bar bar-ca" style="height:${hauteurBarre(ca, maximum)}%" title="CA: ${formatMontant(ca)}"></span>
        <span class="bar bar-profit" style="height:${hauteurBarre(hauteurProfit, maximum)}%" title="Profit: ${formatMontant(profit)}"></span>
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
    elements.reparationsBody.innerHTML = '<tr><td colspan="6">Aucune reparation active.</td></tr>';
    return;
  }

  reparations.forEach(reparation => {
    const produit = reparation.produit || {};
    const client = reparation.client || produit.clientId || {};
    const tr = document.createElement('tr');
    const sla = reparation.sla || {};
    if (sla.criticite === 'retard') tr.classList.add('row-sla-retard');
    if (sla.criticite === 'attention') tr.classList.add('row-sla-attention');
    const lien = produit._id
      ? `/reparation/reparation.html?id=${reparation._id}&produit=${produit._id}`
      : '#';

    tr.innerHTML = `
      <td>${echapperHtml(formatProduit(produit))}</td>
      <td>${echapperHtml(formatClient(client))}</td>
      <td>${formatDate(reparation.date)}</td>
      <td>${echapperHtml(reparation.statut || '-')}</td>
      <td>${formatSla(sla)}</td>
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
      <td><button type="button" class="table-link-button" data-download-facture="${facture._id}" data-taxes="${facture.inclureTaxes ? 'true' : 'false'}">PDF</button></td>
    `;

    elements.facturesBody.appendChild(tr);
  });

  elements.facturesBody.querySelectorAll('[data-download-facture]').forEach(button => {
    button.addEventListener('click', () => {
      telechargerFacture(button.dataset.downloadFacture, button.dataset.taxes === 'true')
        .catch(err => alert(err.message || 'Erreur lors du telechargement'));
    });
  });
}

function afficherReparationsProfit(mois) {
  elements.reparationsProfitChart.innerHTML = '';

  if (!mois.length) {
    elements.reparationsProfitChart.innerHTML = '<p class="empty-chart">Aucune donnee disponible.</p>';
    return;
  }

  const maximumMontant = Math.max(
    ...mois.map(item => Number(item.chiffreAffaires || 0)),
    ...mois.map(item => Number(item.profit || 0)),
    1
  );
  const maximumNombre = Math.max(...mois.map(item => Number(item.nombre || 0)), 1);

  mois.forEach(item => {
    const ca = Number(item.chiffreAffaires || 0);
    const profit = Number(item.profit || 0);
    const hauteurProfit = Math.max(profit, 0);
    const nombre = Number(item.nombre || 0);
    const colonne = document.createElement('div');
    colonne.className = 'chart-month';
    colonne.innerHTML = `
      <div class="chart-bars">
        <span class="bar bar-ca" style="height:${hauteurBarre(ca, maximumMontant)}%" title="Revenus: ${formatMontant(ca)}"></span>
        <span class="bar bar-profit" style="height:${hauteurBarre(hauteurProfit, maximumMontant)}%" title="Profit: ${formatMontant(profit)}"></span>
        <span class="bar bar-count" style="height:${hauteurBarre(nombre, maximumNombre)}%" title="Reparations: ${nombre}"></span>
      </div>
      <strong>${echapperHtml(item.label || '')}</strong>
      <small>${formatMontant(ca)} - ${nombre} rep.</small>
    `;

    elements.reparationsProfitChart.appendChild(colonne);
  });
}

function formatSla(sla) {
  if (!sla || !sla.actif) return '-';
  const classe = sla.criticite === 'retard'
    ? 'sla-badge sla-badge-retard'
    : sla.criticite === 'attention'
      ? 'sla-badge sla-badge-attention'
      : 'sla-badge';
  return `<span class="${classe}">${echapperHtml(sla.message || '-')}</span>`;
}

async function telechargerFacture(factureId, inclureTaxes) {
  const res = await fetch(`/api/factures/${factureId}/pdf?inclureTaxes=${inclureTaxes}`);
  if (!res.ok) throw new Error('Erreur lors du telechargement');

  const blob = await res.blob();
  const contentDisposition = res.headers.get('Content-Disposition');
  let filename = `facture_${factureId}.pdf`;

  if (contentDisposition) {
    const match = contentDisposition.match(/filename="(.+)"/);
    if (match) filename = match[1];
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
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
