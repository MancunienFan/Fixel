let reparationsCache = null;

const STATUT_PAR_DEFAUT = 'en-cours';
const STATUTS_EN_COURS = ['recu', 'diagnostic', 'en attente piece', 'en reparation', 'pret'];
const STATUTS_TERMINEES_OU_LIVREES = ['pret', 'livre'];
const accesFichesLiees = localStorage.getItem('role') === 'admin';

const reparationsTableBody = document.querySelector('#reparationsTable tbody');
const reparationsCount = document.getElementById('reparationsCount');
const filtreStatut = document.getElementById('filtreStatutReparation');
const recherche = document.getElementById('rechercheReparation');
const filtreMois = document.getElementById('filtreMoisReparation');
const filtreAnnee = document.getElementById('filtreAnneeReparation');
const btnResetFiltres = document.getElementById('btnResetFiltresReparations');
const btnRefresh = document.getElementById('btnRefreshReparations');

document.addEventListener('DOMContentLoaded', () => {
  chargerReparations();

  [recherche, filtreAnnee].forEach(element => {
    element.addEventListener('input', appliquerFiltres);
  });
  [filtreStatut, filtreMois].forEach(element => {
    element.addEventListener('change', appliquerFiltres);
  });

  btnResetFiltres.addEventListener('click', () => {
    filtreStatut.value = STATUT_PAR_DEFAUT;
    recherche.value = '';
    filtreMois.value = '';
    filtreAnnee.value = '';
    appliquerFiltres();
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
    appliquerFiltres();
  } catch (err) {
    console.error('Erreur chargement réparations:', err);
    reparationsCache = null;
    reparationsTableBody.innerHTML = '<tr><td colspan="7">Erreur lors du chargement des réparations.</td></tr>';
    reparationsCount.textContent = '0';
  } finally {
    btnRefresh.disabled = false;
    btnRefresh.textContent = 'Actualiser';
  }
}

function appliquerFiltres() {
  if (!reparationsCache) return;

  const statut = filtreStatut.value;
  const texteRecherche = normaliserTexte(recherche.value);
  const statutsChoisis = {
    [STATUT_PAR_DEFAUT]: STATUTS_EN_COURS,
    'terminees-ou-livrees': STATUTS_TERMINEES_OU_LIVREES
  }[statut] || [statut];
  const mois = filtreMois.value ? Number(filtreMois.value) : null;
  const annee = filtreAnnee.value ? Number(filtreAnnee.value) : null;

  const reparationsFiltres = reparationsCache.filter(reparation => {
    if (statut && !statutsChoisis.includes(normaliserStatut(reparation.statut))) return false;

    if (texteRecherche) {
      const client = lireClient(reparation);
      const champs = [
        [client.nom, client.prenom].filter(Boolean).join(' '),
        [client.prenom, client.nom].filter(Boolean).join(' '),
        reparation.produit?.model,
        reparation.description
      ];
      if (!champs.some(champ => normaliserTexte(champ).includes(texteRecherche))) return false;
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

    const lienDetail = construireLienDetail(reparation);
    tr.addEventListener('click', event => {
      if (!event.target.closest('a')) window.location.href = lienDetail;
    });

    tr.innerHTML = `
      <td>${afficherLienFiche(formatClient(client), '/client/client.html', client._id)}</td>
      <td>${afficherLienFiche(formatProduit(produit), '/produit/produit.html', produit._id)}</td>
      <td><a href="${echapperHtml(lienDetail)}">${echapperHtml(reparation.description || 'Ouvrir la réparation')}</a></td>
      <td>${formatMontant(reparation.prix)}</td>
      <td>${echapperHtml(libelleStatut(reparation.statut))}</td>
      <td>${formatDate(reparation.dateReception || reparation.date)}</td>
      <td>${formatDateMiseAJour(lireDerniereMiseAJour(reparation))}</td>
    `;

    reparationsTableBody.appendChild(tr);
  });

  reparationsCount.textContent = reparations.length;
}

function afficherLienFiche(libelle, chemin, id) {
  const texte = echapperHtml(libelle);
  if (!accesFichesLiees || !id) return texte;
  return `<a href="${chemin}?id=${encodeURIComponent(id)}">${texte}</a>`;
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
  if (reparation.updatedAt) {
    const date = new Date(reparation.updatedAt);
    if (!Number.isNaN(date.getTime())) return date;
  }

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

function formatDateMiseAJour(date) {
  return date ? date.toLocaleString('fr-CA', { dateStyle: 'short', timeStyle: 'short' }) : '—';
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
