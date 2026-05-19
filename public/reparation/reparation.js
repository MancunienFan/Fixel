const API_BASE_URL = window.location.origin;
const params = new URLSearchParams(window.location.search);
const reparationId = params.get('id');
const produitId = params.get('produit');
const retourListe = params.get('retour') === 'liste';
const roleUtilisateur = localStorage.getItem('role') || '';
let reparationCourante = null;

const champsDatesWorkflow = [
  'dateReception',
  'dateDiagnostic',
  'dateAttentePiece',
  'dateDebutReparation',
  'datePret',
  'dateLivraison',
  'dateAnnulation'
];

const transitionsReparation = {
  recu: ['diagnostic', 'annule'],
  diagnostic: ['en attente piece', 'en reparation', 'pret', 'annule'],
  'en attente piece': ['diagnostic', 'en reparation', 'annule'],
  'en reparation': ['en attente piece', 'pret', 'annule'],
  pret: ['en reparation', 'livre', 'annule'],
  livre: [],
  annule: []
};

document.getElementById('produitId').value = produitId || '';

if (!reparationId) {
  document.getElementById('btn-update').style.display = 'none';
  document.getElementById('btn-delete').style.display = 'none';
}

if (reparationId) {
  fetch(`${API_BASE_URL}/api/reparations/${reparationId}`)
    .then(res => res.json())
    .then(r => {
      reparationCourante = r;
      for (const [key, val] of Object.entries(r)) {
        const champ = document.querySelector(`[name="${key}"]`);
        if (champ) champ.value = key === 'statut' ? normaliserStatut(val) : val;
      }

      champsDatesWorkflow.forEach(champ => {
        const input = document.getElementById(champ);
        if (input) input.value = formatDateHeure(r[champ]);
      });

      afficherActionsWorkflow(r);
      afficherHistoriqueWorkflow(r.historiqueStatuts || []);
    });

  const btnEnregistrer = document.getElementById('btn-enregistrer');
  if (btnEnregistrer) {
    btnEnregistrer.disabled = true;
    btnEnregistrer.style.opacity = 0.6;
    btnEnregistrer.style.cursor = 'not-allowed';
    btnEnregistrer.title = 'Desactive en mode consultation';
  }
}

document.getElementById('form-reparation').addEventListener('submit', async (e) => {
  e.preventDefault();

  if (!confirm("Confirmer l'enregistrement de cette reparation ?")) return;

  const formData = new FormData(e.target);
  const data = {};
  formData.forEach((v, k) => data[k] = v);

  const res = await fetch(`${API_BASE_URL}/api/reparation`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });

  if (res.ok) {
    alert('Reparation enregistree !');
    if (produitId) window.location.href = `../produit/produit.html?id=${produitId}`;
  } else {
    const err = await res.json().catch(() => ({}));
    alert("Erreur lors de l'ajout : " + (err.erreur || err.error || 'Erreur inconnue'));
  }
});

document.getElementById('btn-update').addEventListener('click', async () => {
  await mettreAJourReparation();
});

document.getElementById('btn-delete').addEventListener('click', async () => {
  if (!confirm('Confirmer la suppression ?')) return;

  const res = await fetch(`${API_BASE_URL}/api/reparations/${reparationId}`, {
    method: 'DELETE'
  });

  if (res.ok) {
    alert('Reparation supprimee !');
    window.location.href = produitId && !retourListe
      ? `../produit/produit.html?id=${produitId}`
      : './reparations.html';
  } else {
    const err = await res.json().catch(() => ({}));
    alert('Erreur lors de la suppression : ' + (err.erreur || err.error || 'Erreur inconnue'));
  }
});

document.getElementById('btn-retour').addEventListener('click', () => {
  if (produitId && !retourListe) {
    window.location.href = `../produit/produit.html?id=${produitId}`;
  } else {
    window.location.href = './reparations.html';
  }
});

function normaliserStatut(valeur) {
  const statut = (valeur || '')
    .toString()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();

  if (statut === 'en attente') return 'recu';
  if (statut === 'en cours') return 'en reparation';
  if (statut === 'terminee' || statut === 'termine') return 'pret';
  if (statut === 'annulee') return 'annule';
  return statut || 'recu';
}

async function mettreAJourReparation(statutForce) {
  const statutAvant = normaliserStatut(reparationCourante && reparationCourante.statut);
  const statutApres = normaliserStatut(statutForce || document.getElementById('statut').value);

  if (!transitionLocaleAutorisee(statutAvant, statutApres)) {
    alert(`Changement d'etape non autorise: ${libelleStatut(statutAvant)} -> ${libelleStatut(statutApres)}.`);
    return;
  }

  if (!confirm('Confirmer la mise a jour ?')) return;

  if (statutForce) {
    document.getElementById('statut').value = statutForce;
  }

  const formData = new FormData(document.getElementById('form-reparation'));
  const data = {};
  formData.forEach((v, k) => data[k] = v);

  const res = await fetch(`${API_BASE_URL}/api/reparations/${reparationId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });

  if (res.ok) {
    alert('Reparation mise a jour !');
    location.reload();
  } else {
    const err = await res.json().catch(() => ({}));
    alert('Erreur lors de la mise a jour : ' + (err.erreur || err.error || 'Erreur inconnue'));
  }
}

function afficherActionsWorkflow(reparation) {
  const conteneur = document.getElementById('workflowActions');
  if (!conteneur) return;

  conteneur.innerHTML = '';
  const statut = normaliserStatut(reparation.statut);
  const prochainsStatuts = roleUtilisateur === 'admin'
    ? Object.keys(transitionsReparation).filter(option => option !== statut)
    : (transitionsReparation[statut] || []);

  if (!reparationId || !prochainsStatuts.length) {
    conteneur.textContent = 'Aucune action rapide disponible.';
    return;
  }

  prochainsStatuts.forEach(prochainStatut => {
    const bouton = document.createElement('button');
    bouton.type = 'button';
    bouton.textContent = libelleActionStatut(prochainStatut);
    bouton.addEventListener('click', () => mettreAJourReparation(prochainStatut));
    conteneur.appendChild(bouton);
  });
}

function afficherHistoriqueWorkflow(historique) {
  const conteneur = document.getElementById('workflowHistory');
  if (!conteneur) return;

  if (!historique.length) {
    conteneur.textContent = 'Aucun historique disponible.';
    return;
  }

  conteneur.innerHTML = historique
    .slice()
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .map(entree => {
      const de = entree.de ? libelleStatut(entree.de) : 'Creation';
      const vers = libelleStatut(entree.vers);
      const meta = [formatDateHeure(entree.date), entree.role].filter(Boolean).join(' - ');
      return `
        <div class="workflow-history-item">
          <strong>${echapperHtml(de)} -> ${echapperHtml(vers)}</strong>
          <div class="workflow-history-meta">${echapperHtml(meta)}</div>
          ${entree.note ? `<div class="workflow-history-note">${echapperHtml(entree.note)}</div>` : ''}
        </div>
      `;
    })
    .join('');
}

function transitionLocaleAutorisee(statutActuel, prochainStatut) {
  if (!statutActuel || !prochainStatut || statutActuel === prochainStatut) return true;
  if (roleUtilisateur === 'admin') return true;
  return (transitionsReparation[statutActuel] || []).includes(prochainStatut);
}

function libelleActionStatut(statut) {
  const libelles = {
    diagnostic: 'Passer en diagnostic',
    'en attente piece': 'Attente piece',
    'en reparation': 'Mettre en reparation',
    pret: 'Marquer pret',
    livre: 'Marquer livre',
    annule: 'Annuler',
    recu: 'Revenir a recu'
  };

  return libelles[statut] || libelleStatut(statut);
}

function libelleStatut(statut) {
  const libelles = {
    recu: 'Recu',
    diagnostic: 'Diagnostic',
    'en attente piece': 'En attente piece',
    'en reparation': 'En reparation',
    pret: 'Pret',
    livre: 'Livre',
    annule: 'Annule'
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

function formatDateHeure(valeur) {
  if (!valeur) return '';
  const date = new Date(valeur);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString('fr-CA');
}
