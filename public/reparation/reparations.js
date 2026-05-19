let reparationsCache = [];

const reparationsTableBody = document.querySelector('#reparationsTable tbody');
const reparationsCount = document.getElementById('reparationsCount');
const filtreStatut = document.getElementById('filtreStatutReparation');
const filtreClient = document.getElementById('filtreClientReparation');
const filtreMois = document.getElementById('filtreMoisReparation');
const filtreAnnee = document.getElementById('filtreAnneeReparation');
const btnResetFiltres = document.getElementById('btnResetFiltresReparations');
const btnRefresh = document.getElementById('btnRefreshReparations');

document.addEventListener('DOMContentLoaded', () => {
  chargerReparations();

  [filtreStatut, filtreClient, filtreMois, filtreAnnee].forEach(element => {
    element.addEventListener('input', appliquerFiltres);
    element.addEventListener('change', appliquerFiltres);
  });

  btnResetFiltres.addEventListener('click', () => {
    filtreStatut.value = '';
    filtreClient.value = '';
    filtreMois.value = '';
    filtreAnnee.value = '';
    afficherReparations(reparationsCache);
  });

  btnRefresh.addEventListener('click', chargerReparations);
});

async function chargerReparations() {
  btnRefresh.disabled = true;
  btnRefresh.textContent = 'Chargement...';

  try {
    const response = await fetch('/api/reparations');
    const reparations = await response.json();

    if (!response.ok) throw new Error(reparations.error || 'Erreur lors du chargement');

    reparationsCache = Array.isArray(reparations) ? reparations : [];
    afficherReparations(reparationsCache);
  } catch (err) {
    console.error('Erreur chargement réparations:', err);
    reparationsTableBody.innerHTML = '<tr><td colspan="7">Erreur lors du chargement des réparations.</td></tr>';
    reparationsCount.textContent = '0';
  } finally {
    btnRefresh.disabled = false;
    btnRefresh.textContent = 'Actualiser';
  }
}

function appliquerFiltres() {
  const statut = filtreStatut.value;
  const clientRecherche = normaliserTexte(filtreClient.value);
  const mois = filtreMois.value ? Number(filtreMois.value) : null;
  const annee = filtreAnnee.value ? Number(filtreAnnee.value) : null;

  const reparationsFiltres = reparationsCache.filter(reparation => {
    if (statut && normaliserStatut(reparation.statut) !== statut) return false;

    if (clientRecherche) {
      const client = lireClient(reparation);
      const texteClient = normaliserTexte(formatClient(client));
      if (!texteClient.includes(clientRecherche)) return false;
    }

    if (mois || annee) {
      const date = lireDateFiltre(reparation);
      if (!date) return false;
      if (mois && date.getMonth() + 1 !== mois) return false;
      if (annee && date.getFullYear() !== annee) return false;
    }

    return true;
  });

  afficherReparations(reparationsFiltres);
}

function afficherReparations(reparations) {
  reparationsTableBody.innerHTML = '';

  if (!reparations.length) {
    reparationsTableBody.innerHTML = '<tr><td colspan="7">Aucune réparation ne correspond aux filtres.</td></tr>';
  }

  reparations.forEach(reparation => {
    const produit = reparation.produit || {};
    const client = lireClient(reparation);
    const tr = document.createElement('tr');
    tr.className = 'clickable-row';
    tr.tabIndex = 0;
    tr.setAttribute('role', 'link');
    tr.setAttribute('aria-label', `Ouvrir la réparation ${reparation.description || ''}`);

    const lienDetail = construireLienDetail(reparation);
    tr.addEventListener('click', () => {
      window.location.href = lienDetail;
    });
    tr.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        window.location.href = lienDetail;
      }
    });

    tr.innerHTML = `
      <td>${echapperHtml(formatClient(client))}</td>
      <td>${echapperHtml(formatProduit(produit))}</td>
      <td>${echapperHtml(reparation.description || '-')}</td>
      <td>${formatMontant(reparation.prix)}</td>
      <td>${echapperHtml(libelleStatut(reparation.statut))}</td>
      <td>${formatDate(reparation.dateReception || reparation.date)}</td>
      <td>${formatDate(lireDerniereMiseAJour(reparation))}</td>
    `;

    reparationsTableBody.appendChild(tr);
  });

  reparationsCount.textContent = reparations.length;
}

function construireLienDetail(reparation) {
  const params = new URLSearchParams({
    id: reparation._id,
    retour: 'liste'
  });

  if (reparation.produit && reparation.produit._id) {
    params.set('produit', reparation.produit._id);
  }

  return `./reparation.html?${params.toString()}`;
}

function lireClient(reparation) {
  return reparation.client || (reparation.produit && reparation.produit.clientId) || {};
}

function lireDateFiltre(reparation) {
  const valeur = reparation.dateReception || reparation.date || lireDerniereMiseAJour(reparation);
  if (!valeur) return null;

  const date = new Date(valeur);
  return Number.isNaN(date.getTime()) ? null : date;
}

function lireDerniereMiseAJour(reparation) {
  const dates = [
    reparation.dateAnnulation,
    reparation.dateLivraison,
    reparation.datePret,
    reparation.dateDebutReparation,
    reparation.dateAttentePiece,
    reparation.dateDiagnostic,
    reparation.dateReception,
    reparation.date,
    ...(Array.isArray(reparation.historiqueStatuts)
      ? reparation.historiqueStatuts.map(entree => entree.date)
      : [])
  ]
    .filter(Boolean)
    .map(valeur => new Date(valeur))
    .filter(date => !Number.isNaN(date.getTime()))
    .sort((a, b) => b - a);

  return dates[0] || null;
}

function formatClient(client) {
  return [client.nom, client.prenom].filter(Boolean).join(' ') || '-';
}

function formatProduit(produit) {
  return [produit.nom, produit.model, produit.imei].filter(Boolean).join(' - ') || '-';
}

function formatMontant(valeur) {
  return `${Number(valeur || 0).toFixed(2)} $`;
}

function formatDate(valeur) {
  if (!valeur) return '';
  const date = new Date(valeur);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('fr-CA');
}

function normaliserTexte(valeur) {
  return (valeur || '')
    .toString()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function normaliserStatut(statut) {
  const valeur = normaliserTexte(statut);
  if (['recu', 'reception', 'en attente'].includes(valeur)) return 'recu';
  if (valeur === 'diagnostic') return 'diagnostic';
  if (['en attente piece', 'attente piece', 'piece'].includes(valeur)) return 'en attente piece';
  if (['en reparation', 'en cours'].includes(valeur)) return 'en reparation';
  if (['pret', 'terminee', 'termine'].includes(valeur)) return 'pret';
  if (['livre', 'livree'].includes(valeur)) return 'livre';
  if (['annule', 'annulee'].includes(valeur)) return 'annule';
  return valeur;
}

function libelleStatut(statut) {
  const libelles = {
    recu: 'Reçu',
    diagnostic: 'Diagnostic',
    'en attente piece': 'En attente pièce',
    'en reparation': 'En réparation',
    pret: 'Prêt',
    livre: 'Livré',
    annule: 'Annulé'
  };

  return libelles[normaliserStatut(statut)] || statut || '-';
}

function echapperHtml(valeur) {
  return (valeur || '').toString().replace(/[&<>"']/g, caractere => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[caractere]));
}
