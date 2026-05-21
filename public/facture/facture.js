let clientsCache = [];
let facturesCache = [];

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
    afficherFacturesFiltrees(tbody);
  } catch (err) {
    console.error('Erreur chargement factures :', err);
    tbody.innerHTML = '<tr><td colspan="11">Erreur lors du chargement des factures.</td></tr>';
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
  tbody.innerHTML = '';

  const facturesCount = document.getElementById('facturesCount');
  if (facturesCount) facturesCount.textContent = factures.length;

  if (!factures.length) {
    tbody.innerHTML = '<tr><td colspan="11">Aucune facture generee pour le moment.</td></tr>';
    return;
  }

  factures.forEach(facture => {
    const tr = document.createElement('tr');
    const statutFacture = statutFactureEffectif(facture);
    const pdfDisponible = pdfFactureDisponible(facture);
    const emailEnvoye = Boolean(facture.emailEnvoye || facture.envoyeeParEmail);

    tr.innerHTML = `
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
        ${renderSourceAction(facture)}
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
  if (facture.type === 'vente') {
    return `Vente ${formatNumeroFacture(facture.sale && facture.sale.numeroVente || '')}`;
  }
  if (facture.type === 'sav') return `SAV ${formatNumeroFacture(facture.sourceNumero || '')}`;
  if (facture.reparations && facture.reparations.length) {
    const premiere = facture.reparations[0];
    const libelle = premiere && typeof premiere === 'object'
      ? premiere.description || premiere.statut || premiere._id
      : premiere;
    return `Reparation ${echapperHtml(libelle || '')}`;
  }
  const produit = facture.produit ? `${facture.produit.nom || ''} ${facture.produit.model || ''}`.trim() : '';
  return echapperHtml(produit || '-');
}

function renderSourceAction(facture) {
  if (facture.type === 'vente' && facture.sale && facture.sale._id) {
    return `<a class="table-link-button" href="/ventes/vente.html?id=${facture.sale._id}">Source</a>`;
  }
  if (facture.type === 'reparation') {
    return '<a class="table-link-button" href="/reparation/reparations.html">Source</a>';
  }
  return '';
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
  if (statut === 'paye' || statut === 'payee') return 'Paye';
  if (statut === 'partiellement paye') return 'Partiellement paye';
  if (statut === 'non paye') return 'Non paye';
  if (statut === 'envoyee') return 'Envoyee';
  if (statut === 'annulee') return 'Annulee';
  return statut || '-';
}

function pdfFactureDisponible(facture) {
  return Boolean(facture.pdfPath || facture.fichierPDF || facture.type === 'reparation' || facture.type === 'vente');
}

function statutFactureEffectif(facture) {
  if (facture.statutFacture === 'annulee' || facture.statut === 'annulee') return 'annulee';
  if (facture.sale && (facture.sale.statut === 'annulee' || facture.sale.statutVente === 'annulee' || facture.sale.annuleeLe || facture.sale.deletedAt)) {
    return 'annulee';
  }
  return 'active';
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
