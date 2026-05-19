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
  const rechercheNumeroFacture = document.getElementById('rechercheNumeroFacture');
  const rechercheClientFacture = document.getElementById('rechercheClientFacture');
  const rechercheDateDebut = document.getElementById('rechercheDateDebut');
  const rechercheDateFin = document.getElementById('rechercheDateFin');
  const btnResetRechercheFactures = document.getElementById('btnResetRechercheFactures');

  await Promise.all([
    chargerClients(clientSelect),
    chargerFactures(facturesTableBody)
  ]);

  btnRefreshFactures.addEventListener('click', () => chargerFactures(facturesTableBody));

  [
    rechercheNumeroFacture,
    rechercheClientFacture,
    rechercheDateDebut,
    rechercheDateFin
  ].forEach(input => {
    input.addEventListener('input', () => afficherFacturesFiltrees(facturesTableBody));
    input.addEventListener('change', () => afficherFacturesFiltrees(facturesTableBody));
  });

  btnResetRechercheFactures.addEventListener('click', () => {
    rechercheNumeroFacture.value = '';
    rechercheClientFacture.value = '';
    rechercheDateDebut.value = '';
    rechercheDateFin.value = '';
    afficherFacturesFiltrees(facturesTableBody);
  });

  clientSelect.addEventListener('change', async () => {
    const clientId = clientSelect.value;

    produitSelect.innerHTML = '<option value="">-- Sélectionnez un produit --</option>';
    reparationSelect.innerHTML = '<option value="">-- Sélectionnez une réparation --</option>';
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

    reparationSelect.innerHTML = '<option value="">-- Sélectionnez une réparation --</option>';
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
    detailsContainer.innerHTML = '<h3>Détails</h3>';

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
    totalLine.textContent = `Sous-total sélectionné : ${formatMontant(total)}`;
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
      alert('Veuillez sélectionner un client, un produit et au moins une réparation.');
      return;
    }

    genererPdfBtn.disabled = true;
    genererPdfBtn.textContent = 'Création...';

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
      if (!response.ok) throw new Error(result.error || result.erreur || 'Erreur lors de la création de la facture');

      if (downloadChecked.checked) {
        await telechargerFacture(result._id, inclureTaxesCheckbox.checked);
      }

      await chargerFactures(facturesTableBody);
      alert(result.message || 'Facture créée avec succès.');
    } catch (err) {
      console.error('Erreur facture :', err);
      alert(err.message || 'Une erreur est survenue lors de la création de la facture.');
    } finally {
      genererPdfBtn.disabled = false;
      genererPdfBtn.textContent = 'Créer la facture';
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
    tbody.innerHTML = '<tr><td colspan="8">Erreur lors du chargement des factures.</td></tr>';
  }
}

function afficherFacturesFiltrees(tbody) {
  afficherFactures(tbody, filtrerFactures());
}

function filtrerFactures() {
  const numero = normaliserTexte(document.getElementById('rechercheNumeroFacture').value).replace(/^#/, '');
  const clientRecherche = normaliserTexte(document.getElementById('rechercheClientFacture').value);
  const dateDebutValue = document.getElementById('rechercheDateDebut').value;
  const dateFinValue = document.getElementById('rechercheDateFin').value;
  const dateDebut = dateDebutValue ? debutJour(dateDebutValue) : null;
  const dateFin = dateFinValue ? finJour(dateFinValue) : null;

  return facturesCache.filter(facture => {
    if (numero && !String(facture.numeroFacture || '').includes(numero)) return false;

    const client = facture.client
      ? `${facture.client.nom || ''} ${facture.client.prenom || ''}`
      : '';
    if (clientRecherche && !normaliserTexte(client).includes(clientRecherche)) return false;

    const dateFacture = lireDate(facture.date);
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
    tbody.innerHTML = '<tr><td colspan="8">Aucune facture ne correspond à la recherche.</td></tr>';
    return;
  }

  factures.forEach(facture => {
    const tr = document.createElement('tr');
    const client = facture.client ? `${facture.client.nom || ''} ${facture.client.prenom || ''}`.trim() : '';
    const produit = facture.produit ? `${facture.produit.nom || ''} ${facture.produit.model || ''}`.trim() : '';

    tr.innerHTML = `
      <td>${formatNumeroFacture(facture.numeroFacture)}</td>
      <td>${client || '-'}</td>
      <td>${produit || '-'}</td>
      <td>${formatDate(facture.date)}</td>
      <td>${formatMontant(facture.totalTTC || facture.totalHT || 0)}</td>
      <td>${renderStatutSelect(facture)}</td>
      <td>${facture.envoyeeParEmail ? 'Envoyée' : 'Non envoyée'}</td>
      <td>
        <button type="button" class="table-action" data-download="${facture._id}" data-taxes="${facture.inclureTaxes ? 'true' : 'false'}">PDF</button>
      </td>
    `;

    tbody.appendChild(tr);
  });

  tbody.querySelectorAll('[data-download]').forEach(button => {
    button.addEventListener('click', () => {
      telechargerFacture(button.dataset.download, button.dataset.taxes === 'true');
    });
  });

  tbody.querySelectorAll('[data-statut]').forEach(select => {
    select.addEventListener('change', async () => {
      await changerStatutFacture(select.dataset.statut, select.value);
      await chargerFactures(tbody);
    });
  });
}

async function changerStatutFacture(factureId, statut) {
  const response = await fetch(`/api/factures/${factureId}/statut`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ statut })
  });

  if (!response.ok) {
    const data = await response.json();
    alert(data.error || 'Impossible de changer le statut.');
  }
}

async function telechargerFacture(factureId, inclureTaxes) {
  const res = await fetch(`/api/factures/${factureId}/pdf?inclureTaxes=${inclureTaxes}`);
  if (!res.ok) throw new Error('Erreur lors du téléchargement');

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

function renderStatutSelect(facture) {
  const statutActuel = facture.statut || 'emise';
  const options = [
    ['emise', 'Émise'],
    ['envoyee', 'Envoyée'],
    ['payee', 'Payée'],
    ['annulee', 'Annulée']
  ];

  return `
    <select class="status-select" data-statut="${facture._id}">
      ${options.map(([value, label]) => `
        <option value="${value}" ${statutActuel === value ? 'selected' : ''}>${label}</option>
      `).join('')}
    </select>
  `;
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

function normaliserTexte(valeur) {
  return (valeur || '')
    .toString()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}
