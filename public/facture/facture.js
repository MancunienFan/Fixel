let clientsCache = [];
let facturesCache = [];
let facturesAffichees = [];
const facturesSelectionnees = new Set();
const roleUtilisateur = localStorage.getItem('role') || '';
const peutSupprimerFactures = roleUtilisateur === 'admin';

document.addEventListener('DOMContentLoaded', async () => {
  const clientSelect = document.getElementById('clientSelect');
  const produitSelect = document.getElementById('produitSelect');
  const reparationSelect = document.getElementById('reparationSelect');
  const produitContainer = document.getElementById('produitContainer');
  const reparationContainer = document.getElementById('reparationContainer');
  const detailsContainer = document.getElementById('detailsContainer');
  const genererPdfBtn = document.getElementById('genererPdfBtn');
  const downloadChecked = document.getElementById('telechargerCheckbox');
  const inclureTaxesCheckbox = document.getElementById('inclureTaxesCheckbox');
  const envoyerMailCheckbox = document.getElementById('envoyerMailCheckbox');
  const checkboxContainer = document.getElementById('checkboxContainer');
  const facturesTableBody = document.querySelector('#facturesTable tbody');
  const btnRefreshFactures = document.getElementById('btnRefreshFactures');
  const selectAllFactures = document.getElementById('selectAllFactures');
  const btnDeleteSelectedFactures = document.getElementById('btnDeleteSelectedFactures');
  const btnClearSelectedFactures = document.getElementById('btnClearSelectedFactures');
  const champsFiltres = [
    'rechercheNumeroFacture',
    'rechercheClientFacture',
    'filtreTypeFacture',
    'filtreStatutPaiement',
    'filtreEmailEnvoye',
    'filtrePdfDisponible',
    'filtreStatutFacture',
    'rechercheDateDebut',
    'rechercheDateFin'
  ].map(id => document.getElementById(id)).filter(Boolean);

  await Promise.all([
    chargerClients(clientSelect),
    chargerFactures(facturesTableBody)
  ]);

  btnRefreshFactures.addEventListener('click', () => chargerFactures(facturesTableBody));
  selectAllFactures.addEventListener('change', () => {
    selectionnerToutesFacturesSupprimables(selectAllFactures.checked);
    afficherFacturesFiltrees(facturesTableBody);
  });
  btnDeleteSelectedFactures.addEventListener('click', supprimerFacturesSelectionnees);
  btnClearSelectedFactures.addEventListener('click', () => {
    facturesSelectionnees.clear();
    afficherFacturesFiltrees(facturesTableBody);
  });
  champsFiltres.forEach(input => {
    input.addEventListener('input', () => afficherFacturesFiltrees(facturesTableBody));
    input.addEventListener('change', () => afficherFacturesFiltrees(facturesTableBody));
  });

  document.getElementById('btnResetRechercheFactures').addEventListener('click', () => {
    champsFiltres.forEach(input => { input.value = ''; });
    afficherFacturesFiltrees(facturesTableBody);
  });

  clientSelect.addEventListener('change', async () => {
    const clientId = clientSelect.value;

    produitSelect.innerHTML = '<option value="">-- Selectionnez un produit --</option>';
    reparationSelect.innerHTML = '<option value="">-- Selectionnez une reparation --</option>';
    produitContainer.style.display = 'none';
    reparationContainer.style.display = 'none';
    detailsContainer.style.display = 'none';
    checkboxContainer.style.display = 'none';
    genererPdfBtn.style.display = 'none';

    if (!clientId) return;

    const produits = await fetch(`/api/produits/client/${clientId}`).then(res => res.json());
    produits.forEach(p => {
      const option = document.createElement('option');
      option.value = p._id;
      option.textContent = `${p.nom || 'Produit'} (${p.imei || p.model || 'sans numero de serie'})`;
      produitSelect.appendChild(option);
    });

    produitContainer.style.display = 'flex';
  });

  produitSelect.addEventListener('change', async () => {
    const produitId = produitSelect.value;

    reparationSelect.innerHTML = '<option value="">-- Selectionnez une reparation --</option>';
    reparationContainer.style.display = 'none';
    detailsContainer.style.display = 'none';
    checkboxContainer.style.display = 'none';
    genererPdfBtn.style.display = 'none';

    if (!produitId) return;

    const reparations = await fetch(`/api/reparations/produit/${produitId}`).then(res => res.json());
    reparations.forEach(r => {
      const option = document.createElement('option');
      option.value = r._id;
      option.dataset.prix = r.prix || 0;
      option.dataset.notes = r.notes || '';
      option.textContent = `${r.description} - ${formatMontant(r.prix)} - ${r.statut}`;
      reparationSelect.appendChild(option);
    });

    reparationContainer.style.display = 'flex';
  });

  reparationSelect.addEventListener('change', () => {
    const selectedOptions = Array.from(reparationSelect.selectedOptions).filter(option => option.value);
    detailsContainer.innerHTML = '<h3>Details</h3>';

    if (!selectedOptions.length) {
      detailsContainer.style.display = 'none';
      checkboxContainer.style.display = 'none';
      genererPdfBtn.style.display = 'none';
      return;
    }

    let total = 0;
    selectedOptions.forEach(option => {
      const prix = Number(option.dataset.prix || 0);
      total += prix;

      const detail = document.createElement('p');
      detail.textContent = `${option.textContent}${option.dataset.notes ? ` (${option.dataset.notes})` : ''}`;
      detailsContainer.appendChild(detail);
    });

    const totalLine = document.createElement('p');
    totalLine.className = 'invoice-total-line';
    totalLine.textContent = `Sous-total selectionne : ${formatMontant(total)}`;
    detailsContainer.appendChild(totalLine);

    detailsContainer.style.display = 'block';
    checkboxContainer.style.display = 'grid';
    genererPdfBtn.style.display = 'inline-flex';
  });

  document.getElementById('factureForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const clientId = clientSelect.value;
    const produitId = produitSelect.value;
    const reparationIds = Array.from(reparationSelect.selectedOptions)
      .map(option => option.value)
      .filter(Boolean);

    if (!clientId || !produitId || reparationIds.length === 0) {
      alert('Veuillez selectionner un client, un produit et au moins une reparation.');
      return;
    }

    genererPdfBtn.disabled = true;
    genererPdfBtn.textContent = 'Creation...';

    try {
      const response = await fetch('/api/factures', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId,
          produitId,
          reparationIds,
          inclureTaxes: inclureTaxesCheckbox.checked,
          envoyerParMail: envoyerMailCheckbox.checked
        })
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.error || result.erreur || 'Erreur lors de la creation de la facture');

      if (downloadChecked.checked) {
        await telechargerFacture(result._id, inclureTaxesCheckbox.checked);
      }

      await chargerFactures(facturesTableBody);
      alert(result.message || 'Facture creee avec succes.');
    } catch (err) {
      console.error('Erreur facture :', err);
      alert(err.message || 'Une erreur est survenue lors de la creation de la facture.');
    } finally {
      genererPdfBtn.disabled = false;
      genererPdfBtn.textContent = 'Creer la facture';
    }
  });
});

async function chargerClients(clientSelect) {
  clientsCache = await fetch('/api/clients').then(res => res.json());
  clientsCache.forEach(c => {
    const option = document.createElement('option');
    option.value = c._id;
    option.textContent = `${c.nom || ''} ${c.prenom || ''}`.trim();
    clientSelect.appendChild(option);
  });
}

async function chargerFactures(tbody) {
  try {
    facturesCache = await fetch('/api/factures').then(res => res.json());
    nettoyerSelectionFactures();
    afficherFacturesFiltrees(tbody);
  } catch (err) {
    console.error('Erreur chargement factures :', err);
    tbody.innerHTML = '<tr><td colspan="12">Erreur lors du chargement des factures.</td></tr>';
  }
}

function afficherFacturesFiltrees(tbody) {
  afficherFactures(tbody, filtrerFactures());
}

function filtrerFactures() {
  const numero = normaliserTexte(valeurChamp('rechercheNumeroFacture')).replace(/^#/, '');
  const clientRecherche = normaliserTexte(valeurChamp('rechercheClientFacture'));
  const typeFacture = valeurChamp('filtreTypeFacture');
  const statutPaiement = valeurChamp('filtreStatutPaiement');
  const emailEnvoye = valeurChamp('filtreEmailEnvoye');
  const pdfDisponible = valeurChamp('filtrePdfDisponible');
  const statutFacture = valeurChamp('filtreStatutFacture');
  const dateDebut = valeurChamp('rechercheDateDebut') ? debutJour(valeurChamp('rechercheDateDebut')) : null;
  const dateFin = valeurChamp('rechercheDateFin') ? finJour(valeurChamp('rechercheDateFin')) : null;

  return facturesCache.filter(facture => {
    if (numero && !String(facture.numeroFacture || '').includes(numero)) return false;
    if (typeFacture && facture.type !== typeFacture) return false;
    if (statutPaiement && (facture.statutPaiement || '') !== statutPaiement) return false;
    if (emailEnvoye && String(Boolean(facture.emailEnvoye || facture.envoyeeParEmail)) !== emailEnvoye) return false;
    if (pdfDisponible && String(pdfFactureDisponible(facture)) !== pdfDisponible) return false;
    if (statutFacture && statutFactureEffectif(facture) !== statutFacture) return false;
    if (clientRecherche && !normaliserTexte(nomClientFacture(facture)).includes(clientRecherche)) return false;

    const dateFacture = lireDate(facture.date || facture.dateEmission);
    if ((dateDebut || dateFin) && !dateFacture) return false;
    if (dateDebut && dateFacture < dateDebut) return false;
    if (dateFin && dateFacture > dateFin) return false;

    return true;
  });
}

function afficherFactures(tbody, factures) {
  facturesAffichees = factures;
  nettoyerSelectionFactures();
  tbody.innerHTML = '';

  const facturesCount = document.getElementById('facturesCount');
  if (facturesCount) facturesCount.textContent = factures.length;

  if (!factures.length) {
    tbody.innerHTML = '<tr><td colspan="12">Aucune facture generee pour le moment.</td></tr>';
    mettreAJourSelectionFactures();
    return;
  }

  factures.forEach(facture => {
    const tr = document.createElement('tr');
    const statutFacture = statutFactureEffectif(facture);
    const pdfDisponible = pdfFactureDisponible(facture);
    const emailEnvoye = Boolean(facture.emailEnvoye || facture.envoyeeParEmail);
    const supprimable = factureSupprimable(facture);
    const selectionnable = supprimable && peutSupprimerFactures;
    const cochee = facturesSelectionnees.has(facture._id);

    tr.innerHTML = `
      <td>
        <input type="checkbox" data-select-facture="${facture._id}" ${cochee ? 'checked' : ''} ${selectionnable ? '' : 'disabled'} title="${selectionnable ? 'Selectionner cette facture' : 'Suppression possible seulement si la facture est annulee'}">
      </td>
      <td>${formatNumeroFacture(facture.numeroFacture)}</td>
      <td>${formatDate(facture.date || facture.dateEmission)}</td>
      <td>${renderBadge(libelleTypeFacture(facture.type), facture.type === 'vente' ? 'info' : 'neutral')}</td>
      <td>${echapperHtml(nomClientFacture(facture))}</td>
      <td>${renderSource(facture)}</td>
      <td>${formatMontant(facture.totalTTC || facture.totalHT || 0)}</td>
      <td>${echapperHtml(libelleStatutPaiement(facture))}</td>
      <td>${renderBadge(emailEnvoye ? 'Oui' : 'Non', emailEnvoye ? 'success' : 'neutral')}</td>
      <td>${renderBadge(pdfDisponible ? 'Oui' : 'Non', pdfDisponible ? 'success' : 'neutral')}</td>
      <td>${renderBadge(statutFacture === 'annulee' ? 'Annulee' : 'Active', statutFacture === 'annulee' ? 'danger' : 'success')}</td>
      <td class="invoice-actions">
        <button type="button" class="table-action" data-download="${facture._id}" data-taxes="${facture.inclureTaxes ? 'true' : 'false'}">PDF</button>
        <button type="button" class="table-action" data-email="${facture._id}">Email</button>
        ${renderDetailsAction(facture)}
        ${renderDeleteAction(facture)}
      </td>
    `;

    tbody.appendChild(tr);
  });

  tbody.querySelectorAll('[data-download]').forEach(button => {
    button.addEventListener('click', () => {
      telechargerFacture(button.dataset.download, button.dataset.taxes === 'true')
        .catch(err => alert(err.message || 'Impossible de telecharger la facture.'));
    });
  });

  tbody.querySelectorAll('[data-email]').forEach(button => {
    button.addEventListener('click', () => envoyerFactureEmail(button.dataset.email));
  });

  tbody.querySelectorAll('[data-details-facture]').forEach(button => {
    button.addEventListener('click', () => ouvrirDetailsFacture(button.dataset.detailsFacture));
  });

  tbody.querySelectorAll('[data-delete-facture]').forEach(button => {
    button.addEventListener('click', () => supprimerFacture(button.dataset.deleteFacture));
  });

  tbody.querySelectorAll('[data-select-facture]').forEach(checkbox => {
    checkbox.addEventListener('change', () => {
      if (checkbox.checked) facturesSelectionnees.add(checkbox.dataset.selectFacture);
      else facturesSelectionnees.delete(checkbox.dataset.selectFacture);
      mettreAJourSelectionFactures();
    });
  });

  mettreAJourSelectionFactures();
}

async function supprimerFacture(factureId) {
  const facture = facturesCache.find(item => item._id === factureId);
  if (!factureSupprimable(facture)) {
    alert('Seules les factures annulees peuvent etre supprimees.');
    return;
  }

  if (!confirm('Voulez-vous vraiment supprimer cette facture ? Cette action est irreversible.')) return;

  const response = await fetch(`/api/factures/${factureId}`, { method: 'DELETE' });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    alert(data.erreur || data.error || 'Suppression impossible.');
    return;
  }

  facturesSelectionnees.clear();
  await chargerFactures(document.querySelector('#facturesTable tbody'));
  alert('Facture supprimee avec succes.');
}

async function supprimerFacturesSelectionnees() {
  const idsAffiches = new Set(facturesAffichees.map(facture => facture._id));
  const ids = Array.from(facturesSelectionnees).filter(id => {
    if (!idsAffiches.has(id)) return false;
    const facture = facturesCache.find(item => item._id === id);
    return factureSupprimable(facture);
  });

  if (!ids.length) return;
  if (!confirm(`Voulez-vous vraiment supprimer les ${ids.length} factures selectionnees ? Cette action est irreversible.`)) return;

  const response = await fetch('/api/factures/bulk', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    alert(data.erreur || data.error || 'Suppression multiple impossible.');
    return;
  }

  facturesSelectionnees.clear();
  await chargerFactures(document.querySelector('#facturesTable tbody'));

  const message = `${data.supprimees || 0} factures supprimees avec succes. ${data.ignorees || 0} ignoree(s).`;
  alert(message);
}

function selectionnerToutesFacturesSupprimables(selectionner) {
  facturesAffichees.forEach(facture => {
    if (!factureSupprimable(facture) || !peutSupprimerFactures) return;
    if (selectionner) facturesSelectionnees.add(facture._id);
    else facturesSelectionnees.delete(facture._id);
  });
}

function mettreAJourSelectionFactures() {
  const selectedCount = document.getElementById('facturesSelectedCount');
  const btnDeleteSelected = document.getElementById('btnDeleteSelectedFactures');
  const selectAll = document.getElementById('selectAllFactures');
  const idsSelectionnables = facturesAffichees
    .filter(facture => factureSupprimable(facture) && peutSupprimerFactures)
    .map(facture => facture._id);
  const nombreSelectionne = idsSelectionnables.filter(id => facturesSelectionnees.has(id)).length;

  if (selectedCount) selectedCount.textContent = nombreSelectionne;
  if (btnDeleteSelected) btnDeleteSelected.disabled = nombreSelectionne === 0;
  if (selectAll) {
    selectAll.disabled = idsSelectionnables.length === 0;
    selectAll.checked = idsSelectionnables.length > 0 && nombreSelectionne === idsSelectionnables.length;
    selectAll.indeterminate = nombreSelectionne > 0 && nombreSelectionne < idsSelectionnables.length;
  }
}

function nettoyerSelectionFactures() {
  const idsExistants = new Set(facturesCache.map(facture => facture._id));
  Array.from(facturesSelectionnees).forEach(id => {
    const facture = facturesCache.find(item => item._id === id);
    if (!idsExistants.has(id) || !factureSupprimable(facture)) facturesSelectionnees.delete(id);
  });
}

async function telechargerFacture(factureId, inclureTaxes) {
  const res = await fetch(`/api/factures/${factureId}/pdf?inclureTaxes=${inclureTaxes}`);
  if (!res.ok) throw new Error('Erreur lors du telechargement');

  const blob = await res.blob();
  const contentDisposition = res.headers.get('Content-Disposition');
  let filename = `facture_${factureId}.pdf`;

  if (contentDisposition) {
    const matches = contentDisposition.match(/filename="(.+)"/);
    if (matches && matches[1]) filename = matches[1];
  }

  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}

async function envoyerFactureEmail(factureId) {
  const facture = facturesCache.find(item => item._id === factureId);
  const emailDefaut = facture && (facture.emailDestinataire || facture.client && facture.client.email) || '';
  const email = prompt('Courriel destinataire', emailDefaut);
  if (!email) return;

  const response = await fetch(`/api/factures/${factureId}/send-email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ emailFacture: email })
  });
  const data = await response.json().catch(() => ({}));
  alert(data.message || data.error || (response.ok ? 'Facture envoyee.' : 'Erreur envoi facture.'));
  await chargerFactures(document.querySelector('#facturesTable tbody'));
}

function renderSource(facture) {
  return echapperHtml(texteSourceFacture(facture));
}

function texteSourceFacture(facture) {
  if (facture.type === 'vente') {
    return `Vente ${formatNumeroFacture(facture.sale && facture.sale.numeroVente || '')}`;
  }
  if (facture.type === 'sav') return `SAV ${formatNumeroFacture(facture.sourceNumero || '')}`;
  if (facture.reparations && facture.reparations.length) {
    const premiere = facture.reparations[0];
    const libelle = premiere && typeof premiere === 'object'
      ? premiere.description || premiere.statut || premiere._id
      : premiere;
    return `Reparation ${libelle || ''}`;
  }
  const produit = facture.produit ? `${facture.produit.nom || ''} ${facture.produit.model || ''}`.trim() : '';
  return produit || '-';
}

function renderDetailsAction(facture) {
  return `<button type="button" class="table-action" data-details-facture="${facture._id}">Détails</button>`;
}

function renderDeleteAction(facture) {
  const supprimable = factureSupprimable(facture);
  if (supprimable && peutSupprimerFactures) {
    return `<button type="button" class="table-action table-action-danger" data-delete-facture="${facture._id}">Supprimer</button>`;
  }

  return `<button type="button" class="table-action" disabled title="${peutSupprimerFactures ? 'Suppression possible seulement si la facture est annulee' : 'Suppression reservee aux administrateurs'}">Supprimer</button>`;
}

function nomClientFacture(facture) {
  if (facture.client) {
    return `${facture.client.nom || ''} ${facture.client.prenom || ''}`.trim() || facture.client.email || 'Client';
  }
  return facture.clientNomAffiche || (facture.type === 'vente' ? 'Vente comptoir' : 'Client non renseigne');
}

function libelleTypeFacture(type) {
  if (type === 'vente') return 'Vente';
  if (type === 'sav') return 'SAV';
  if (type === 'autre') return 'Autre';
  return 'Reparation';
}

function libelleStatutPaiement(facture) {
  const statut = facture.statutPaiement || facture.statut || '';
  if (statut === 'paye' || statut === 'payee') return 'Payé';
  if (statut === 'partiellement paye') return 'Partiellement payé';
  if (statut === 'non paye') return 'Non payé';
  if (statut === 'envoyee') return 'Envoyee';
  if (statut === 'annulee') return 'Annulee';
  return statut || '-';
}

function facturePayee(facture) {
  const statut = facture && (facture.statutPaiement || facture.statut || '');
  return statut === 'paye' || statut === 'payee';
}

function pdfFactureDisponible(facture) {
  return Boolean(facture.pdfDisponible || facture.type === 'reparation' || facture.type === 'vente');
}

function statutFactureEffectif(facture) {
  if (facture.statutFacture === 'annulee' || facture.statut === 'annulee') return 'annulee';
  if (facture.sale && (facture.sale.statut === 'annulee' || facture.sale.statutVente === 'annulee' || facture.sale.annuleeLe || facture.sale.deletedAt)) {
    return 'annulee';
  }
  return 'active';
}

function factureSupprimable(facture) {
  return statutFactureEffectif(facture || {}) === 'annulee'
    || (facture && facture.statutPaiement === 'annulee');
}

function renderBadge(label, variante) {
  return `<span class="invoice-badge invoice-badge-${variante || 'neutral'}">${echapperHtml(label)}</span>`;
}

function formatNumeroFacture(numero) {
  return numero ? `#${String(numero).padStart(4, '0')}` : '-';
}

function formatDate(valeur) {
  const date = lireDate(valeur);
  return date ? date.toLocaleDateString('fr-CA') : '-';
}

function formatMontant(valeur) {
  const montant = Number(valeur || 0);
  return `${montant.toFixed(2)} $`;
}

function lireDate(valeur) {
  if (!valeur) return null;
  const date = new Date(valeur);
  return Number.isNaN(date.getTime()) ? null : date;
}

function debutJour(dateString) {
  const date = new Date(`${dateString}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function finJour(dateString) {
  const date = new Date(`${dateString}T23:59:59.999`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function valeurChamp(id) {
  const element = document.getElementById(id);
  return element ? element.value : '';
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
  return String(valeur ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

async function ouvrirDetailsFacture(factureId) {
  const modal = document.getElementById('factureDetailModal');
  const contenu = document.getElementById('factureDetailContent');
  const titre = document.getElementById('factureDetailTitle');
  const paidBtn = document.getElementById('factureDetailPaidBtn');
  const pdfBtn = document.getElementById('factureDetailPdfBtn');
  const emailBtn = document.getElementById('factureDetailEmailBtn');
  if (!modal || !contenu || !titre || !paidBtn || !pdfBtn || !emailBtn) return;

  const factureLocale = facturesCache.find(item => item._id === factureId) || {};
  titre.textContent = `Facture ${formatNumeroFacture(factureLocale.numeroFacture)}`;
  contenu.innerHTML = '<p>Chargement des détails...</p>';
  ouvrirModalDetailsFacture();

  try {
    const response = await fetch(`/api/factures/${factureId}`);
    const facture = response.ok ? await response.json() : null;
    if (!response.ok || !facture) throw new Error('Impossible de charger les détails de la facture.');

    titre.textContent = `Facture ${formatNumeroFacture(facture.numeroFacture)}`;
    contenu.innerHTML = renderDetailsFacture(facture);

    configurerBoutonPaiementFacture(paidBtn, facture);
    pdfBtn.onclick = () => telechargerFacture(facture._id, Boolean(facture.inclureTaxes))
      .catch(err => alert(err.message || 'Impossible de telecharger la facture.'));
    emailBtn.onclick = () => envoyerFactureEmail(facture._id);
  } catch (err) {
    contenu.innerHTML = `<p>${echapperHtml(err.message || 'Erreur lors du chargement des détails.')}</p>`;
  }
}

function configurerBoutonPaiementFacture(button, facture) {
  const dejaPayee = facturePayee(facture);
  button.disabled = dejaPayee;
  button.style.display = dejaPayee ? 'none' : 'inline-flex';
  button.onclick = dejaPayee ? null : () => marquerFacturePayee(facture._id);
}

async function marquerFacturePayee(factureId) {
  if (!confirm('Confirmer que cette facture a été payée ?')) return;

  const response = await fetch(`/api/factures/${factureId}/statut`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ statut: 'payee' })
  });
  const facture = await response.json().catch(() => null);

  if (!response.ok || !facture) {
    alert(facture && (facture.error || facture.erreur) || 'Impossible de marquer la facture comme payée.');
    return;
  }

  mettreAJourFactureCache(facture);
  afficherFacturesFiltrees(document.querySelector('#facturesTable tbody'));
  document.getElementById('factureDetailContent').innerHTML = renderDetailsFacture(facture);
  configurerBoutonPaiementFacture(document.getElementById('factureDetailPaidBtn'), facture);
}

function mettreAJourFactureCache(facture) {
  const index = facturesCache.findIndex(item => item._id === facture._id);
  if (index >= 0) facturesCache[index] = { ...facturesCache[index], ...facture };
}

function ouvrirModalDetailsFacture() {
  const modal = document.getElementById('factureDetailModal');
  if (!modal) return;
  modal.classList.add('open');
  modal.setAttribute('aria-hidden', 'false');
  document.body.classList.add('modal-open');
}

function fermerModalDetailsFacture() {
  const modal = document.getElementById('factureDetailModal');
  if (!modal) return;
  modal.classList.remove('open');
  modal.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('modal-open');
}

document.addEventListener('click', event => {
  if (event.target && event.target.matches('[data-close-facture-detail]')) {
    fermerModalDetailsFacture();
  }
});

document.addEventListener('keydown', event => {
  if (event.key === 'Escape') fermerModalDetailsFacture();
});

function renderDetailsFacture(facture) {
  const client = facture.client || {};
  const emailEnvoye = Boolean(facture.emailEnvoye || facture.envoyeeParEmail);
  const pdfDisponible = pdfFactureDisponible(facture);
  const items = lignesFacture(facture);
  const source = texteSourceFacture(facture);
  const notes = facture.notes || facture.sale && facture.sale.notes || notesReparations(facture) || '';

  return `
    <div class="invoice-detail-grid">
      ${renderDetailSection('Informations générales', [
        ['Numéro de facture', formatNumeroFacture(facture.numeroFacture)],
        ['Date de la facture', formatDate(facture.date || facture.dateEmission)],
        ['Type de facture', libelleTypeFacture(facture.type)],
        ['Source', source]
      ])}
      ${renderDetailSection('Client', [
        ['Nom', nomClientFacture(facture)],
        ['Telephone', client.telephone || '-'],
        ['Email', client.email || facture.emailDestinataire || '-']
      ])}
      <section class="invoice-detail-section invoice-detail-wide">
        <h3>Détails des articles/services</h3>
        ${renderLignesFacture(items)}
      </section>
      ${renderDetailSection('Paiement et taxes', [
        ['Sous-total', formatMontant(facture.totalHT || sousTotalItems(items))],
        ['TPS', formatMontant(facture.tps || facture.montantTPS || 0)],
        ['TVQ', formatMontant(facture.tvq || facture.montantTVQ || 0)],
        ['Total', formatMontant(facture.totalTTC || facture.totalHT || 0)],
        ['Mode de paiement', libelleModePaiementFacture(facture.modePaiement)]
      ])}
      ${renderDetailSection('Statuts', [
        ['Paiement', libelleStatutPaiement(facture)],
        ['Facture', statutFactureEffectif(facture) === 'annulee' ? 'Annulée' : 'Active'],
        ['Email', emailEnvoye ? 'Envoyé' : 'Non envoyé'],
        ['PDF', pdfDisponible ? 'Disponible' : 'Non disponible']
      ])}
      ${notes ? `<section class="invoice-detail-section invoice-detail-wide"><h3>Notes</h3><p>${echapperHtml(notes)}</p></section>` : ''}
    </div>
  `;
}

function renderDetailSection(titre, lignes) {
  return `
    <section class="invoice-detail-section">
      <h3>${echapperHtml(titre)}</h3>
      <dl>
        ${lignes.map(([label, valeur]) => `
          <div>
            <dt>${echapperHtml(label)}</dt>
            <dd>${valeurHtml(valeur)}</dd>
          </div>
        `).join('')}
      </dl>
    </section>
  `;
}

function renderLignesFacture(items) {
  if (!items.length) return '<p>Aucun article ou service détaillé.</p>';

  return `
    <div class="invoice-detail-table">
      <table>
        <thead>
          <tr>
            <th>Produit ou service</th>
            <th>Quantité</th>
            <th>Prix unitaire</th>
            <th>Sous-total</th>
          </tr>
        </thead>
        <tbody>
          ${items.map(item => `
            <tr>
              <td>${echapperHtml(item.description || '-')}</td>
              <td>${echapperHtml(item.quantite || 1)}</td>
              <td>${formatMontant(item.prixUnitaire || 0)}</td>
              <td>${formatMontant(item.totalLigne || 0)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function lignesFacture(facture) {
  if (facture.sale && Array.isArray(facture.sale.items) && facture.sale.items.length) {
    return facture.sale.items.map(item => ({
      description: item.description,
      quantite: item.quantite || 1,
      prixUnitaire: item.prixUnitaire || 0,
      totalLigne: item.totalLigne || (Number(item.quantite || 1) * Number(item.prixUnitaire || 0))
    }));
  }

  if (Array.isArray(facture.reparations) && facture.reparations.length) {
    return facture.reparations.map(reparation => ({
      description: reparation.description || reparation.statut || 'Reparation',
      quantite: 1,
      prixUnitaire: reparation.prix || 0,
      totalLigne: reparation.prix || 0
    }));
  }

  if (facture.produit) {
    const description = `${facture.produit.nom || ''} ${facture.produit.model || ''}`.trim();
    return [{
      description: description || 'Produit',
      quantite: 1,
      prixUnitaire: facture.totalHT || facture.totalTTC || 0,
      totalLigne: facture.totalHT || facture.totalTTC || 0
    }];
  }

  return [];
}

function sousTotalItems(items) {
  return items.reduce((total, item) => total + Number(item.totalLigne || 0), 0);
}

function notesReparations(facture) {
  if (!Array.isArray(facture.reparations)) return '';
  return facture.reparations
    .map(reparation => reparation && reparation.notes)
    .filter(Boolean)
    .join('\n');
}

function libelleModePaiementFacture(valeur) {
  if (!valeur) return '-';
  const libelles = {
    comptant: 'Comptant',
    interac: 'Interac',
    virement: 'Virement',
    carte: 'Carte',
    autre: 'Autre'
  };
  return libelles[valeur] || valeur;
}

function valeurHtml(valeur) {
  if (valeur === null || valeur === undefined || valeur === '') return '-';
  return echapperHtml(valeur);
}
