let produitsCache = [];

const tbody = document.querySelector('#produitsTable tbody');
const profitTotalSpan = document.getElementById('profitTotal');
const produitsCount = document.getElementById('produitsCount');
const filtreStatut = document.getElementById('filtreStatut');
const filtreDateType = document.getElementById('filtreDateType');
const filtreAnnee = document.getElementById('filtreAnnee');
const filtreDateDebut = document.getElementById('filtreDateDebut');
const filtreDateFin = document.getElementById('filtreDateFin');
const btnFiltre2026 = document.getElementById('btnFiltre2026');
const btnResetFiltres = document.getElementById('btnResetFiltres');
const sortButtons = document.querySelectorAll('.sort-header');
let triActuel = {
  champ: null,
  direction: 'asc'
};

initialiserFiltreStatut();

fetch('/api/produits')
  .then(res => res.json())
  .then(produits => {
    produitsCache = produits;
    appliquerFiltres();
  })
  .catch(err => {
    console.error('Erreur chargement produits:', err);
    tbody.innerHTML = '<tr><td colspan="7">Erreur lors du chargement des produits.</td></tr>';
  });

[
  filtreStatut,
  filtreDateType,
  filtreAnnee,
  filtreDateDebut,
  filtreDateFin
].forEach(element => {
  element.addEventListener('input', appliquerFiltres);
  element.addEventListener('change', appliquerFiltres);
});

btnFiltre2026.addEventListener('click', () => {
  filtreAnnee.value = '2026';
  appliquerFiltres();
});

sortButtons.forEach(button => {
  button.addEventListener('click', () => {
    const champ = button.dataset.sort;

    if (triActuel.champ === champ) {
      triActuel.direction = triActuel.direction === 'asc' ? 'desc' : 'asc';
    } else {
      triActuel.champ = champ;
      triActuel.direction = 'asc';
    }

    appliquerFiltres();
  });
});

btnResetFiltres.addEventListener('click', () => {
  filtreStatut.value = 'disponible';
  filtreDateType.value = 'dateachat';
  filtreAnnee.value = '';
  filtreDateDebut.value = '';
  filtreDateFin.value = '';
  triActuel = {
    champ: null,
    direction: 'asc'
  };
  appliquerFiltres();
});

function initialiserFiltreStatut() {
  const params = new URLSearchParams(window.location.search);
  const statutUrl = params.get('statut') || params.get('disponibilite');
  const valeursAutorisees = ['', 'disponible', 'vendu', 'pieces'];

  filtreStatut.value = valeursAutorisees.includes(statutUrl) ? statutUrl : 'disponible';
}

function appliquerFiltres() {
  const statut = filtreStatut.value;
  const dateType = filtreDateType.value;
  const annee = filtreAnnee.value ? Number(filtreAnnee.value) : null;
  const dateDebut = filtreDateDebut.value ? debutJour(filtreDateDebut.value) : null;
  const dateFin = filtreDateFin.value ? finJour(filtreDateFin.value) : null;

  const produitsFiltres = produitsCache.filter(produit => {
    if (statut && normaliserStatut(produit.disponibilite) !== statut) return false;

    const dateProduit = lireDateProduit(produit, dateType);
    if ((annee || dateDebut || dateFin) && !dateProduit) return false;
    if (annee && dateProduit.getFullYear() !== annee) return false;
    if (dateDebut && dateProduit < dateDebut) return false;
    if (dateFin && dateProduit > dateFin) return false;

    return true;
  });

  afficherProduits(appliquerTri(produitsFiltres));
}

function appliquerTri(produits) {
  mettreAJourIndicateursTri();

  if (!triActuel.champ) return [...produits];

  return [...produits].sort((a, b) => {
    const valeurA = lireValeurTri(a, triActuel.champ);
    const valeurB = lireValeurTri(b, triActuel.champ);

    if (valeurA === null && valeurB === null) return 0;
    if (valeurA === null) return 1;
    if (valeurB === null) return -1;

    const resultat = valeurA - valeurB;
    return triActuel.direction === 'asc' ? resultat : -resultat;
  });
}

function lireValeurTri(produit, champ) {
  if (champ === 'prix') {
    const prix = Number(produit.prix);
    return Number.isNaN(prix) ? null : prix;
  }

  const date = lireDateProduit(produit, champ);
  return date ? date.getTime() : null;
}

function mettreAJourIndicateursTri() {
  sortButtons.forEach(button => {
    const estActif = button.dataset.sort === triActuel.champ;
    const indicateur = button.querySelector('.sort-indicator');
    button.classList.toggle('active', estActif);
    button.setAttribute('aria-sort', estActif ? (triActuel.direction === 'asc' ? 'ascending' : 'descending') : 'none');
    if (indicateur) {
      indicateur.textContent = estActif ? (triActuel.direction === 'asc' ? '↑' : '↓') : '↕';
    }
  });
}

function afficherProduits(produits) {
  tbody.innerHTML = '';

  let profitTotal = 0;

  if (!produits.length) {
    tbody.innerHTML = '<tr><td colspan="7">Aucun produit ne correspond aux filtres.</td></tr>';
  }

  produits.forEach(produit => {
    const tr = document.createElement('tr');
    tr.style.cursor = 'pointer';
    tr.onclick = () => {
      window.location.href = `./produit/produit.html?id=${produit._id}`;
    };

    const estVendu = normaliserStatut(produit.disponibilite) === 'vendu';

    tr.innerHTML = `
      <td>${echapperHtml(produit.nom || '')}</td>
      <td>${echapperHtml(produit.statut || '')}</td>
      <td>${formatMontant(produit.prix)}</td>
      <td>${echapperHtml(produit.disponibilite || '')}</td>
      <td>${echapperHtml(produit.dateachatFormatee || formatDate(produit.dateachat))}</td>
      <td>${echapperHtml(estVendu ? (produit.dateventeFormatee || formatDate(produit.datevente)) : '')}</td>
      <td>${echapperHtml(produit.datemodificationFormatee || formatDate(produit.datemodification))}</td>
    `;
    tbody.appendChild(tr);

    if (estVendu) {
      const achat = parseFloat(produit.prixachat || 0);
      const vente = parseFloat(produit.prixvente || 0);
      profitTotal += vente - achat;
    }
  });

  produitsCount.textContent = produits.length;
  profitTotalSpan.textContent = `${profitTotal.toFixed(2)} $`;
}

function lireDateProduit(produit, champ) {
  if (champ === 'datevente' && normaliserStatut(produit.disponibilite) !== 'vendu') return null;

  const valeur = produit[champ];
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

function formatDate(valeur) {
  if (!valeur) return '';
  const date = new Date(valeur);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('fr-FR');
}

function formatMontant(valeur) {
  const montant = parseFloat(valeur || 0);
  return `${montant.toFixed(2)} $`;
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

  if (valeur === 'disponible') return 'disponible';
  if (valeur === 'vendu' || valeur === 'sold') return 'vendu';
  if (valeur.includes('piece')) return 'pieces';
  return valeur;
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

function logout() {
  if (window.FixelAuth) {
    window.FixelAuth.logout();
    return;
  }

  localStorage.removeItem('token');
  localStorage.removeItem('role');
  sessionStorage.removeItem('token');
  sessionStorage.removeItem('role');
  window.location.href = '/login/login.html';
}
