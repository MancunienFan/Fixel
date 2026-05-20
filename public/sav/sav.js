const STATUTS_SAV = [
  'nouveau retour',
  'en diagnostic',
  'en attente du client',
  'en attente de piece',
  'reparation sav en cours',
  'resolu',
  'refuse',
  'non couvert par garantie',
  'ferme'
];

const STATUTS_FERMES = ['resolu', 'refuse', 'non couvert par garantie', 'ferme'];

let savCache = [];
let clientsCache = [];
let produitsCache = [];
let reparationsCache = [];
let facturesCache = [];

const elements = {
  tbody: document.querySelector('#savTable tbody'),
  count: document.getElementById('savCount'),
  ouverts: document.getElementById('savOuverts'),
  resolus: document.getElementById('savResolus'),
  cout: document.getElementById('savCout'),
  recherche: document.getElementById('filtreRechercheSav'),
  statut: document.getElementById('filtreStatutSav'),
  garantie: document.getElementById('filtreGarantieSav'),
  mois: document.getElementById('filtreMoisSav'),
  annee: document.getElementById('filtreAnneeSav'),
  btnReset: document.getElementById('btnResetFiltresSav'),
  btnRefresh: document.getElementById('btnRefreshSav'),
  btnAjouter: document.getElementById('btnAjouterSav'),
  formSection: document.getElementById('savFormSection'),
  detailSection: document.getElementById('savDetailSection'),
  form: document.getElementById('savForm'),
  formTitre: document.getElementById('savFormTitre'),
  detailTitre: document.getElementById('savDetailTitre'),
  detailSousTitre: document.getElementById('savDetailSousTitre'),
  detailContenu: document.getElementById('savDetailContenu'),
  warrantyAlert: document.getElementById('savWarrantyAlert')
};

document.addEventListener('DOMContentLoaded', () => {
  initialiserStatuts();
  initialiserDates();
  brancherEvenements();
  chargerDonneesInitiales();
});

function initialiserStatuts() {
  const options = STATUTS_SAV
    .map(statut => `<option value="${statut}">${libelleStatut(statut)}</option>`)
    .join('');

  elements.statut.insertAdjacentHTML('beforeend', options);
  document.getElementById('status').innerHTML = options;
}

function initialiserDates() {
  document.getElementById('returnDate').value = formatDateInput(new Date());
}

function brancherEvenements() {
  [elements.recherche, elements.statut, elements.garantie, elements.mois, elements.annee].forEach(element => {
    element.addEventListener('input', appliquerFiltres);
    element.addEventListener('change', appliquerFiltres);
  });

  elements.btnReset.addEventListener('click', () => {
    elements.recherche.value = '';
    elements.statut.value = '';
    elements.garantie.value = '';
    elements.mois.value = '';
    elements.annee.value = '';
    afficherSav(savCache);
  });

  elements.btnRefresh.addEventListener('click', chargerSav);
  elements.btnAjouter.addEventListener('click', () => ouvrirFormulaire());
  document.getElementById('btnAnnulerSav').addEventListener('click', fermerFormulaire);
  document.getElementById('btnFermerDetailSav').addEventListener('click', fermerDetail);
  document.getElementById('clientId').addEventListener('change', synchroniserRelations);
  document.getElementById('productId').addEventListener('change', synchroniserRelations);
  document.getElementById('repairId').addEventListener('change', remplirDepuisReparation);
  document.getElementById('invoiceId').addEventListener('change', remplirDepuisFacture);
  elements.form.addEventListener('submit', sauvegarderSav);
}

async function chargerDonneesInitiales() {
  await chargerClients();
  await Promise.all([
    chargerProduits(),
    chargerReparations(),
    chargerFactures()
  ]);
  remplirSelectsRelations();
  await chargerSav();
  const id = new URLSearchParams(window.location.search).get('id');
  if (id) ouvrirDetail(id);
}

async function chargerClients() {
  const res = await fetch('/api/clients');
  clientsCache = res.ok ? await res.json() : [];
}

async function chargerProduits() {
  const stock = await fetch('/api/produits').then(res => res.ok ? res.json() : []);
  const produitsClient = await Promise.all(clientsCache.map(client => (
    fetch(`/api/produits/client/${client._id}`).then(res => res.ok ? res.json() : [])
  )));
  produitsCache = [...stock, ...produitsClient.flat()];
}

async function chargerReparations() {
  const res = await fetch('/api/reparations');
  reparationsCache = res.ok ? await res.json() : [];
}

async function chargerFactures() {
  const res = await fetch('/api/factures');
  facturesCache = res.ok ? await res.json() : [];
}

async function chargerSav() {
  elements.btnRefresh.disabled = true;
  elements.btnRefresh.textContent = 'Chargement...';

  try {
    const res = await fetch('/api/sav');
    const data = await res.json();
    if (!res.ok) throw new Error(data.erreur || 'Erreur chargement SAV');
    savCache = Array.isArray(data) ? data : [];
    appliquerFiltres();
  } catch (err) {
    console.error('Erreur SAV:', err);
    elements.tbody.innerHTML = '<tr><td colspan="11">Erreur lors du chargement des retours SAV.</td></tr>';
  } finally {
    elements.btnRefresh.disabled = false;
    elements.btnRefresh.textContent = 'Actualiser';
  }
}

function remplirSelectsRelations(retour = {}) {
  const clientSelect = document.getElementById('clientId');
  const produitSelect = document.getElementById('productId');

  clientSelect.innerHTML = '<option value="">Choisir un client</option>' + clientsCache
    .map(client => `<option value="${client._id}">${echapperHtml(formatClient(client))}</option>`)
    .join('');

  produitSelect.innerHTML = '<option value="">Choisir un produit</option>' + produitsCache
    .map(produit => `<option value="${produit._id}" data-client="${produit.clientId || ''}">${echapperHtml(formatProduit(produit))}</option>`)
    .join('');

  if (retour.clientId) clientSelect.value = idRelation(retour.clientId);
  if (retour.productId) produitSelect.value = idRelation(retour.productId);
  synchroniserRelations(retour);
}

function synchroniserRelations(retour = {}) {
  const clientId = document.getElementById('clientId').value;
  const productId = document.getElementById('productId').value;
  const repairSelect = document.getElementById('repairId');
  const invoiceSelect = document.getElementById('invoiceId');

  const reparations = reparationsCache.filter(rep => (
    (!productId || idRelation(rep.produit) === productId)
    && (!clientId || idRelation(rep.client) === clientId || idRelation(rep.produit && rep.produit.clientId) === clientId)
  ));

  repairSelect.innerHTML = '<option value="">Aucune</option>' + reparations
    .map(rep => `<option value="${rep._id}">${echapperHtml(formatDate(rep.date))} - ${echapperHtml(rep.description || '')}</option>`)
    .join('');

  const factures = facturesCache.filter(facture => (
    (!productId || idRelation(facture.produit) === productId)
    && (!clientId || idRelation(facture.client) === clientId)
  ));

  invoiceSelect.innerHTML = '<option value="">Aucune</option>' + factures
    .map(facture => `<option value="${facture._id}">#${String(facture.numeroFacture || '').padStart(4, '0')} - ${echapperHtml(formatDate(facture.date))}</option>`)
    .join('');

  if (retour.repairId) repairSelect.value = idRelation(retour.repairId);
  if (retour.invoiceId) invoiceSelect.value = idRelation(retour.invoiceId);
}

function appliquerFiltres() {
  const recherche = normaliserTexte(elements.recherche.value);
  const statut = elements.statut.value;
  const garantie = elements.garantie.value;
  const mois = elements.mois.value ? Number(elements.mois.value) : null;
  const annee = elements.annee.value ? Number(elements.annee.value) : null;

  const filtres = savCache.filter(retour => {
    if (statut && retour.status !== statut) return false;
    if (garantie && retour.warrantyStatus !== garantie) return false;

    if (recherche) {
      const texte = normaliserTexte([
        retour.savNumber,
        formatClient(retour.clientId),
        formatProduit(retour.productId),
        retour.customerIssue,
        retour.internalDiagnosis
      ].join(' '));
      if (!texte.includes(recherche)) return false;
    }

    if (mois || annee) {
      const date = new Date(retour.returnDate);
      if (Number.isNaN(date.getTime())) return false;
      if (mois && date.getMonth() + 1 !== mois) return false;
      if (annee && date.getFullYear() !== annee) return false;
    }

    return true;
  });

  afficherSav(filtres);
}

function afficherSav(retours) {
  elements.tbody.innerHTML = '';

  if (!retours.length) {
    elements.tbody.innerHTML = '<tr><td colspan="11">Aucun retour SAV ne correspond aux filtres.</td></tr>';
  }

  retours.forEach(retour => {
    const tr = document.createElement('tr');
    tr.className = `clickable-row ${classeGarantie(retour)}`;
    tr.tabIndex = 0;
    tr.addEventListener('click', () => ouvrirDetail(retour._id));
    tr.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        ouvrirDetail(retour._id);
      }
    });

    tr.innerHTML = `
      <td>${formatSavNumber(retour.savNumber)}</td>
      <td>${formatDate(retour.returnDate)}</td>
      <td>${echapperHtml(formatClient(retour.clientId))}</td>
      <td>${echapperHtml(formatProduit(retour.productId))}</td>
      <td>${retour.returnType === 'vente' ? 'Apres vente' : 'Apres reparation'}</td>
      <td>${echapperHtml(retour.customerIssue || '-')}</td>
      <td>${formatGarantie(retour)}</td>
      <td>${echapperHtml(libelleStatut(retour.status))}</td>
      <td>${formatMontant(retour.realCost)}</td>
      <td>${echapperHtml(libelleDecision(retour.decision))}</td>
      <td>${formatDate(retour.resolutionDate)}</td>
    `;

    elements.tbody.appendChild(tr);
  });

  elements.count.textContent = retours.length;
  elements.ouverts.textContent = retours.filter(retour => !STATUTS_FERMES.includes(retour.status)).length;
  elements.resolus.textContent = retours.filter(retour => retour.status === 'resolu').length;
  elements.cout.textContent = formatMontant(retours.reduce((total, retour) => total + Number(retour.realCost || 0), 0));
}

async function ouvrirDetail(id) {
  const res = await fetch(`/api/sav/${id}`);
  const retour = await res.json();
  if (!res.ok) {
    alert(retour.erreur || 'Retour SAV introuvable');
    return;
  }

  elements.detailSection.style.display = 'block';
  elements.formSection.style.display = 'none';
  elements.detailTitre.textContent = `Retour SAV ${formatSavNumber(retour.savNumber)}`;
  elements.detailSousTitre.textContent = `${formatClient(retour.clientId)} - ${formatProduit(retour.productId)}`;
  elements.warrantyAlert.innerHTML = construireAlerteGarantie(retour);
  elements.detailContenu.innerHTML = construireDetail(retour);

  document.getElementById('btnModifierSavDetail').addEventListener('click', () => ouvrirFormulaire(retour));
  elements.detailSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function construireDetail(retour) {
  const historique = Array.isArray(retour.historiqueStatuts) && retour.historiqueStatuts.length
    ? retour.historiqueStatuts.map(item => `
      <div class="workflow-history-item">
        <strong>${echapperHtml(libelleStatut(item.vers))}</strong>
        <div class="workflow-history-meta">${formatDateHeure(item.date)}${item.role ? ` - ${echapperHtml(item.role)}` : ''}</div>
        ${item.note ? `<div class="workflow-history-note">${echapperHtml(item.note)}</div>` : ''}
      </div>
    `).join('')
    : '<p class="empty-chart">Aucun historique.</p>';

  return `
    <div class="sav-detail-panel">
      <h3>Client</h3>
      <p>${echapperHtml(formatClient(retour.clientId))}</p>
      <p>${echapperHtml(retour.clientId && retour.clientId.telephone || '-')}</p>
      <p>${echapperHtml(retour.clientId && retour.clientId.email || '-')}</p>
    </div>
    <div class="sav-detail-panel">
      <h3>Appareil</h3>
      <p>${echapperHtml(formatProduit(retour.productId))}</p>
      <p>Type: ${echapperHtml(retour.productId && retour.productId.type || '-')}</p>
      <p>Disponibilite: ${echapperHtml(retour.productId && retour.productId.disponibilite || '-')}</p>
    </div>
    <div class="sav-detail-panel">
      <h3>Liens</h3>
      <p>Reparation: ${retour.repairId ? echapperHtml(retour.repairId.description || '-') : 'Aucune'}</p>
      <p>Facture: ${retour.invoiceId ? `#${String(retour.invoiceId.numeroFacture || '').padStart(4, '0')}` : 'Aucune'}</p>
      <p>Garantie: ${formatGarantie(retour)}</p>
    </div>
    <div class="sav-detail-panel">
      <h3>Couts</h3>
      <p>Estime: ${formatMontant(retour.estimatedCost)}</p>
      <p>Reel: ${formatMontant(retour.realCost)}</p>
      <p>Decision: ${echapperHtml(libelleDecision(retour.decision))}</p>
    </div>
    <div class="sav-detail-panel sav-detail-wide">
      <h3>Probleme declare</h3>
      <p>${echapperHtml(retour.customerIssue || '-')}</p>
      <p>${echapperHtml(retour.detailedDescription || '')}</p>
    </div>
    <div class="sav-detail-panel sav-detail-wide">
      <h3>Diagnostic et notes</h3>
      <p><strong>Diagnostic:</strong> ${echapperHtml(retour.internalDiagnosis || '-')}</p>
      <p><strong>Notes internes:</strong> ${echapperHtml(retour.internalNotes || '-')}</p>
      <p><strong>Photos / notes:</strong> ${echapperHtml(retour.photosNotes || '-')}</p>
    </div>
    <div class="sav-detail-panel sav-detail-wide">
      <h3>Historique des statuts</h3>
      <div class="workflow-history">${historique}</div>
    </div>
    <div class="sav-detail-panel">
      <h3>Dates</h3>
      <p>Creation: ${formatDateHeure(retour.createdAt)}</p>
      <p>Resolution: ${formatDate(retour.resolutionDate)}</p>
      <p>Fermeture: ${formatDate(retour.closedAt)}</p>
    </div>
    <div class="actions sav-detail-actions">
      <button type="button" id="btnModifierSavDetail" class="btn-warning">Modifier</button>
    </div>
  `;
}

function ouvrirFormulaire(retour = null) {
  elements.formSection.style.display = 'block';
  elements.detailSection.style.display = 'none';
  elements.form.reset();
  initialiserDates();
  remplirSelectsRelations(retour || {});
  document.getElementById('savId').value = retour ? retour._id : '';
  elements.formTitre.textContent = retour ? `Modifier ${formatSavNumber(retour.savNumber)}` : 'Ajouter un retour SAV';

  if (retour) {
    remplirChamp('returnDate', formatDateInput(retour.returnDate));
    remplirChamp('returnType', retour.returnType);
    remplirChamp('warrantyId', retour.warrantyId || '');
    remplirChamp('warrantyStatus', retour.warrantyStatus);
    remplirChamp('warrantyStartDate', formatDateInput(retour.warrantyStartDate));
    remplirChamp('warrantyEndDate', formatDateInput(retour.warrantyEndDate));
    remplirChamp('status', retour.status);
    remplirChamp('decision', retour.decision);
    remplirChamp('estimatedCost', retour.estimatedCost || '');
    remplirChamp('realCost', retour.realCost || '');
    remplirChamp('resolutionDate', formatDateInput(retour.resolutionDate));
    remplirChamp('customerIssue', retour.customerIssue || '');
    remplirChamp('detailedDescription', retour.detailedDescription || '');
    remplirChamp('photosNotes', retour.photosNotes || '');
    remplirChamp('internalDiagnosis', retour.internalDiagnosis || '');
    remplirChamp('internalNotes', retour.internalNotes || '');
  }

  elements.formSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function fermerFormulaire() {
  elements.formSection.style.display = 'none';
}

function fermerDetail() {
  elements.detailSection.style.display = 'none';
}

async function sauvegarderSav(event) {
  event.preventDefault();

  const formData = new FormData(elements.form);
  const data = {};
  formData.forEach((value, key) => {
    if (key !== 'savId' && value !== '') data[key] = value;
  });

  const id = document.getElementById('savId').value;
  const url = id ? `/api/sav/${id}` : '/api/sav';
  const method = id ? 'PUT' : 'POST';

  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  const retour = await res.json();

  if (!res.ok) {
    alert(retour.erreur || 'Erreur lors de l enregistrement');
    return;
  }

  await chargerSav();
  fermerFormulaire();
  ouvrirDetail(retour._id);
}

function remplirDepuisReparation() {
  const id = document.getElementById('repairId').value;
  const reparation = reparationsCache.find(item => item._id === id);
  if (!reparation) return;

  remplirChamp('productId', idRelation(reparation.produit));
  remplirChamp('clientId', idRelation(reparation.client) || idRelation(reparation.produit && reparation.produit.clientId));
  remplirChamp('returnType', 'reparation');
  synchroniserRelations({ repairId: id });
}

function remplirDepuisFacture() {
  const id = document.getElementById('invoiceId').value;
  const facture = facturesCache.find(item => item._id === id);
  if (!facture) return;

  remplirChamp('productId', idRelation(facture.produit));
  remplirChamp('clientId', idRelation(facture.client));
  remplirChamp('returnType', 'vente');
  synchroniserRelations({ invoiceId: id });
}

function construireAlerteGarantie(retour) {
  const statut = retour.warrantyComputedStatus;
  const fin = formatDate(retour.warrantyEndDate);

  if (statut === 'expiree') {
    return `<div class="sav-alert sav-alert-danger">Garantie expiree${fin !== '-' ? ` le ${fin}` : ''}.</div>`;
  }

  if (statut === 'active') {
    const jours = Number.isFinite(retour.warrantyDaysRemaining) ? ` - ${retour.warrantyDaysRemaining} jour(s) restants` : '';
    return `<div class="sav-alert sav-alert-success">Garantie active${fin !== '-' ? ` jusqu'au ${fin}` : ''}${jours}.</div>`;
  }

  if (statut === 'aucune') {
    return '<div class="sav-alert">Aucune garantie trouvee.</div>';
  }

  return '<div class="sav-alert sav-alert-warning">Garantie a verifier manuellement.</div>';
}

function formatGarantie(retour) {
  const statut = retour.warrantyComputedStatus || retour.warrantyStatus;
  if (statut === 'active') return `Active${retour.warrantyEndDate ? ` (${formatDate(retour.warrantyEndDate)})` : ''}`;
  if (statut === 'expiree') return `Expiree${retour.warrantyEndDate ? ` (${formatDate(retour.warrantyEndDate)})` : ''}`;
  if (statut === 'aucune') return 'Aucune garantie';
  if (retour.warrantyStatus === 'oui') return 'Oui';
  if (retour.warrantyStatus === 'non') return 'Non';
  return 'A verifier';
}

function classeGarantie(retour) {
  if (retour.warrantyComputedStatus === 'expiree') return 'row-sla-retard';
  if (retour.warrantyComputedStatus === 'active') return 'row-sav-garantie-active';
  return '';
}

function formatClient(client = {}) {
  return [client.nom, client.prenom].filter(Boolean).join(' ') || '-';
}

function formatProduit(produit = {}) {
  return [produit.nom, produit.model, produit.imei].filter(Boolean).join(' - ') || '-';
}

function formatSavNumber(numero) {
  return numero ? `SAV-${String(numero).padStart(4, '0')}` : '-';
}

function formatDate(valeur) {
  if (!valeur) return '-';
  const date = new Date(valeur);
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleDateString('fr-CA');
}

function formatDateHeure(valeur) {
  if (!valeur) return '-';
  const date = new Date(valeur);
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleString('fr-CA');
}

function formatDateInput(valeur) {
  if (!valeur) return '';
  const date = new Date(valeur);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

function formatMontant(valeur) {
  return `${Number(valeur || 0).toFixed(2)} $`;
}

function libelleStatut(statut) {
  const libelles = {
    'nouveau retour': 'Nouveau retour',
    'en diagnostic': 'En diagnostic',
    'en attente du client': 'En attente du client',
    'en attente de piece': 'En attente de piece',
    'reparation sav en cours': 'Reparation SAV en cours',
    resolu: 'Resolu',
    refuse: 'Refuse',
    'non couvert par garantie': 'Non couvert par garantie',
    ferme: 'Ferme'
  };
  return libelles[statut] || statut || '-';
}

function libelleDecision(decision) {
  const libelles = {
    'a definir': 'A definir',
    couvert: 'Couvert',
    'non couvert': 'Non couvert',
    'geste commercial': 'Geste commercial',
    echange: 'Echange',
    'remboursement partiel': 'Remboursement partiel',
    'reparation payante': 'Reparation payante'
  };
  return libelles[decision] || decision || '-';
}

function idRelation(relation) {
  if (!relation) return '';
  return typeof relation === 'string' ? relation : relation._id || '';
}

function remplirChamp(id, valeur) {
  const champ = document.getElementById(id);
  if (champ) champ.value = valeur || '';
}

function normaliserTexte(valeur) {
  return (valeur || '')
    .toString()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
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
