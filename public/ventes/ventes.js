let ventesCache = [];
const roleUtilisateur = localStorage.getItem('role') || '';
const peutAnnulerVente = roleUtilisateur === 'admin';

const tbody = document.querySelector('#ventesTable tbody');
const elements = {
  count: document.getElementById('ventesCount'),
  refresh: document.getElementById('btnRefreshVentes'),
  reset: document.getElementById('btnResetFiltresVentes'),
  client: document.getElementById('filtreClient'),
  dateDebut: document.getElementById('filtreDateDebut'),
  dateFin: document.getElementById('filtreDateFin'),
  statutPaiement: document.getElementById('filtreStatutPaiement'),
  modePaiement: document.getElementById('filtreModePaiement'),
  factureGeneree: document.getElementById('filtreFactureGeneree'),
  factureEnvoyee: document.getElementById('filtreFactureEnvoyee'),
  taxes: document.getElementById('filtreTaxes')
};

document.addEventListener('DOMContentLoaded', () => {
  chargerVentes();
  elements.refresh.addEventListener('click', chargerVentes);
  elements.reset.addEventListener('click', reinitialiserFiltres);

  Object.values(elements)
    .filter(element => element && element !== elements.refresh && element !== elements.reset && element !== elements.count)
    .forEach(element => {
      element.addEventListener('input', afficherVentesFiltrees);
      element.addEventListener('change', afficherVentesFiltrees);
    });
});

async function chargerVentes() {
  tbody.innerHTML = '<tr><td colspan="11">Chargement...</td></tr>';
  try {
    const res = await fetch('/api/sales');
    const data = await res.json();
    if (!res.ok) throw new Error(data.erreur || 'Erreur chargement ventes');
    ventesCache = Array.isArray(data) ? data : [];
    afficherVentesFiltrees();
  } catch (err) {
    console.error('Erreur ventes:', err);
    tbody.innerHTML = '<tr><td colspan="11">Erreur lors du chargement.</td></tr>';
  }
}

function afficherVentesFiltrees() {
  const ventes = filtrerVentes();
  tbody.innerHTML = '';
  elements.count.textContent = ventes.length;

  if (!ventes.length) {
    tbody.innerHTML = '<tr><td colspan="11">Aucune vente ne correspond aux filtres.</td></tr>';
    return;
  }

  ventes.forEach(vente => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${formatNumero(vente.numeroVente)}</td>
      <td>${formatDate(vente.dateVente)}</td>
      <td>${echapperHtml(formatClient(vente.client))}</td>
      <td>${formatMontant(vente.total)}</td>
      <td>${formatMontant(vente.profitTotal)}</td>
      <td>${echapperHtml(libelleModePaiement(vente.modePaiement))}</td>
      <td>${echapperHtml(libelleStatutPaiement(vente.statutPaiement))}</td>
      <td>${vente.taxesActivees ? 'Oui' : 'Non'}</td>
      <td>${vente.factureGeneree ? 'Oui' : 'Non'}</td>
      <td>${vente.factureEnvoyee ? 'Oui' : 'Non'}</td>
      <td class="table-actions">
        <a class="table-link-button" href="/ventes/vente.html?id=${vente._id}">Voir</a>
        <button type="button" class="table-link-button" data-pdf="${vente._id}" ${roleUtilisateur === 'consultant' && !vente.factureGeneree ? 'disabled' : ''}>PDF</button>
        <button type="button" class="table-link-button" data-email="${vente._id}" ${roleUtilisateur === 'consultant' ? 'disabled' : ''}>Email</button>
        <button type="button" class="table-link-button" data-delete="${vente._id}" ${peutAnnulerVente ? '' : 'disabled'}>Supprimer</button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll('[data-pdf]').forEach(button => {
    button.addEventListener('click', () => telechargerPdf(button.dataset.pdf));
  });
  tbody.querySelectorAll('[data-email]').forEach(button => {
    button.addEventListener('click', () => envoyerEmail(button.dataset.email));
  });
  tbody.querySelectorAll('[data-delete]').forEach(button => {
    button.addEventListener('click', () => supprimerVente(button.dataset.delete));
  });
}

function filtrerVentes() {
  const client = normaliserTexte(elements.client.value);
  const debut = elements.dateDebut.value ? debutJour(elements.dateDebut.value) : null;
  const fin = elements.dateFin.value ? finJour(elements.dateFin.value) : null;

  return ventesCache.filter(vente => {
    if (venteAnnulee(vente)) return false;
    if (client && !normaliserTexte(formatClient(vente.client)).includes(client)) return false;

    const date = lireDate(vente.dateVente);
    if ((debut || fin) && !date) return false;
    if (debut && date < debut) return false;
    if (fin && date > fin) return false;
    if (elements.statutPaiement.value && vente.statutPaiement !== elements.statutPaiement.value) return false;
    if (elements.modePaiement.value && vente.modePaiement !== elements.modePaiement.value) return false;
    if (elements.factureGeneree.value && String(Boolean(vente.factureGeneree)) !== elements.factureGeneree.value) return false;
    if (elements.factureEnvoyee.value && String(Boolean(vente.factureEnvoyee)) !== elements.factureEnvoyee.value) return false;
    if (elements.taxes.value && String(Boolean(vente.taxesActivees)) !== elements.taxes.value) return false;
    return true;
  });
}

function reinitialiserFiltres() {
  ['client', 'dateDebut', 'dateFin', 'statutPaiement', 'modePaiement', 'factureGeneree', 'factureEnvoyee', 'taxes']
    .forEach(cle => { elements[cle].value = ''; });
  afficherVentesFiltrees();
}

async function telechargerPdf(id) {
  let res = await fetch(`/api/sales/${id}/invoice`);
  if (res.status === 404) {
    const generation = await fetch(`/api/sales/${id}/generate-invoice`, { method: 'POST' });
    if (generation.ok) res = await fetch(`/api/sales/${id}/invoice`);
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    alert(data.erreur || 'Impossible de telecharger la facture.');
    return;
  }

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `facture_vente_${id}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  await chargerVentes();
}

async function envoyerEmail(id) {
  const vente = ventesCache.find(item => item._id === id);
  const email = prompt('Courriel destinataire', vente && (vente.emailFacture || vente.client && vente.client.email) || '');
  if (!email) return;

  const res = await fetch(`/api/sales/${id}/send-invoice`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ emailFacture: email })
  });
  const data = await res.json().catch(() => ({}));
  alert(data.message || data.erreur || (res.ok ? 'Facture envoyee.' : 'Erreur envoi facture.'));
  await chargerVentes();
}

async function supprimerVente(id) {
  if (!peutAnnulerVente) {
    alert('Vous n avez pas la permission d annuler une vente.');
    return;
  }

  if (!confirm('Voulez-vous vraiment supprimer cette vente ? Cette action remettra les produits disponibles et retirera la vente du tableau de bord.')) return;

  const res = await fetch(`/api/sales/${id}`, { method: 'DELETE' });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    alert(data.erreur || 'Suppression impossible.');
    return;
  }

  alert(data.message || 'Vente annulee avec succes.');
  await chargerVentes();
}

function venteAnnulee(vente) {
  return Boolean(
    vente
    && (
      vente.statut === 'annulee'
      || vente.statutVente === 'annulee'
      || vente.deletedAt
      || vente.annuleeLe
    )
  );
}

function formatClient(client) {
  if (!client) return 'Vente rapide';
  return [client.prenom, client.nom].filter(Boolean).join(' ') || 'Vente rapide';
}

function formatNumero(numero) {
  return numero ? `#${String(numero).padStart(4, '0')}` : '-';
}

function formatDate(valeur) {
  const date = lireDate(valeur);
  return date ? date.toLocaleDateString('fr-CA') : '-';
}

function formatMontant(valeur) {
  const nombre = Number.parseFloat(valeur);
  return `${(Number.isFinite(nombre) ? nombre : 0).toFixed(2)} $`;
}

function lireDate(valeur) {
  if (!valeur) return null;
  const date = new Date(valeur);
  return Number.isNaN(date.getTime()) ? null : date;
}

function debutJour(valeur) {
  return lireDate(`${valeur}T00:00:00`);
}

function finJour(valeur) {
  return lireDate(`${valeur}T23:59:59.999`);
}

function normaliserTexte(valeur) {
  return (valeur || '').toString().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
}

function libelleModePaiement(valeur) {
  return { comptant: 'Comptant', interac: 'Interac', virement: 'Virement', carte: 'Carte', autre: 'Autre' }[valeur] || valeur || '-';
}

function libelleStatutPaiement(valeur) {
  return { paye: 'Paye', 'partiellement paye': 'Partiellement paye', 'non paye': 'Non paye' }[valeur] || valeur || '-';
}

function echapperHtml(valeur) {
  return (valeur || '').toString().replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}
