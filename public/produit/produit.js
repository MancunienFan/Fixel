// Lire l'ID dans l'URL
const params = new URLSearchParams(window.location.search);
const produitId = params.get("id");
const clientId = params.get("clientId");
const API_BASE_URL = window.location.origin;

const token = localStorage.getItem('token');
const role = localStorage.getItem('role');
const btnDetecterTelephone = document.getElementById('btn-detecter-telephone');
const messageDetection = document.getElementById('device-detect-message');

if (!token) {
  window.location.href = '/login/login.html';
} else if (role !== 'admin') {
  alert("Accès refusé.");
  window.location.href = '/index.html';
}

window.addEventListener('DOMContentLoaded', () => {
  const typeSelect = document.getElementById("type");
  if (!typeSelect) return;

  // ⬇️ Fonction à part pour afficher ou cacher dynamiquement
  function mettreAJourAffichageSelonType() {
    const isClient = typeSelect.value === "client";

    const champs = [
      "champ-prix",
      "champ-categorie",
      "champ-etatbatterie",
      "champ-statut",
      "champ-prixachat",
      "champ-prixvente",
      "champ-disponibilite"
    ];

    champs.forEach(id => {
      const champ = document.getElementById(id);
      if (champ) champ.style.display = isClient ? "none" : "block";
    });

    const champsAControler = ["prix", "disponibilite"];
    champsAControler.forEach(id => {
      const input = document.getElementById(id);
      if (input) input.required = !isClient;
    });
  }

  // Lors du changement manuel du type
  typeSelect.addEventListener("change", mettreAJourAffichageSelonType);

  // ⬇️ Mode création à partir de l’interface client
  if (clientId && !produitId) {
    document.getElementById("type").value = "client";
    mettreAJourAffichageSelonType();
  }

  // ⬇️ Mode modification : charger le produit
  if (produitId) {
    const btnEnregistrer = document.getElementById('submit');
    if (btnEnregistrer) {
      btnEnregistrer.disabled = true;
      btnEnregistrer.style.opacity = 0.6;
      btnEnregistrer.style.cursor = 'not-allowed';
      btnEnregistrer.title = "Désactivé en consultation";
    }

    fetch(`${API_BASE_URL}/api/produit/${produitId}`)
      .then(res => res.json())
      .then(p => {
        for (const [key, value] of Object.entries(p)) {
          const champ = document.querySelector(`[name="${key}"]`);
          if (champ) champ.value = value;
        }

        // 🔁 Mise à jour après avoir rempli le type
        mettreAJourAffichageSelonType();
      })
      .catch(err => {
        alert("Erreur lors du chargement du produit : " + err.message);
      });

    chargerReparations();
    chargerRetoursSavProduit();
  } else {
    // En mode ajout : cacher update/delete
    document.getElementById('btn-update').style.display = 'none';
    document.getElementById('btn-delete').style.display = 'none';
  }
});

if (btnDetecterTelephone) {
  btnDetecterTelephone.addEventListener('click', detecterTelephoneBranche);
}

async function chargerRetoursSavProduit() {
  const res = await fetch(`${API_BASE_URL}/api/sav?productId=${produitId}`);
  const retours = await res.json();

  if (!Array.isArray(retours) || !retours.length) return;

  document.getElementById('sav-produit-container').style.display = 'block';
  const tbody = document.querySelector('#table-sav-produit tbody');
  tbody.innerHTML = '';

  retours.forEach(retour => {
    const tr = document.createElement('tr');
    tr.classList.add('clickable-row');
    tr.addEventListener('click', () => {
      window.location.href = `../sav/sav.html?id=${retour._id}`;
    });

    tr.innerHTML = `
      <td>${formatSavNumber(retour.savNumber)}</td>
      <td>${formatDateSav(retour.returnDate)}</td>
      <td>${echapperHtmlSav(formatClientSav(retour.clientId))}</td>
      <td>${echapperHtmlSav(retour.customerIssue || '-')}</td>
      <td>${echapperHtmlSav(formatGarantieSav(retour))}</td>
      <td>${echapperHtmlSav(formatStatutSav(retour.status))}</td>
      <td>${Number(retour.realCost || 0).toFixed(2)} $</td>
    `;

    tbody.appendChild(tr);
  });
}

async function detecterTelephoneBranche() {
  afficherMessageDetection('Détection en cours...', 'info');
  btnDetecterTelephone.disabled = true;

  try {
    const res = await fetch(`${API_BASE_URL}/api/device/detect`);
    const data = await res.json();

    if (!res.ok || !data.detected) {
      afficherMessageDetection(
        data.message || 'Aucun téléphone détecté. Vous pouvez entrer les informations manuellement.',
        'warning'
      );
      return;
    }

    remplirChampProduit('nom', data.produit);
    remplirChampProduit('model', data.modele);
    remplirChampProduit('imei', data.numeroSerie);
    remplirChampProduit('etatbatterie', data.etatBatterie);

    const champsManquants = [
      data.produit ? null : 'produit',
      data.modele ? null : 'modèle',
      data.numeroSerie ? null : 'numéro de série',
      data.etatBatterie !== '' && data.etatBatterie !== undefined ? null : 'état de batterie'
    ].filter(Boolean);

    afficherMessageDetection(
      champsManquants.length
        ? `Téléphone détecté, mais certaines informations sont manquantes (${champsManquants.join(', ')}). Vous pouvez les entrer manuellement.`
        : 'Téléphone détecté. Les champs disponibles ont été remplis.',
      champsManquants.length ? 'warning' : 'success'
    );
  } catch (err) {
    console.error('Erreur detection telephone:', err);
    afficherMessageDetection('Impossible de détecter le téléphone. Vous pouvez entrer les informations manuellement.', 'warning');
  } finally {
    btnDetecterTelephone.disabled = false;
  }
}

function remplirChampProduit(nomChamp, valeur) {
  if (valeur === undefined || valeur === null || valeur === '') return;

  const champ = document.querySelector(`[name="${nomChamp}"]`);
  if (champ) champ.value = valeur;
}

function afficherMessageDetection(message, type) {
  if (!messageDetection) return;

  messageDetection.textContent = message;
  messageDetection.className = `device-detect-message device-detect-message-${type}`;
}

// === RÉPARATIONS ===
async function chargerReparations() {
  const res = await fetch(`${API_BASE_URL}/api/reparations/produit/${produitId}`);
  const reparations = await res.json();

  if (!reparations.length) return;

  document.getElementById('reparations-container').style.display = 'block';
  const tbody = document.querySelector('#table-reparations tbody');
  tbody.innerHTML = '';

  reparations.forEach(rep => {
    const tr = document.createElement('tr');
    tr.style.cursor = "pointer";
    tr.addEventListener('click', () => {
      window.location.href = `../reparation/reparation.html?id=${rep._id}&produit=${produitId}`;
    });

    tr.innerHTML = `
      <td>${rep.description}</td>
      <td>${rep.prix.toFixed(2)} $</td>
      <td>${rep.statut}</td>
      <td>${new Date(rep.date).toLocaleDateString()}</td>
    `;

    tbody.appendChild(tr);
  });
}

// === ENREGISTRER ===
document.getElementById('form-produit').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!confirm("Voulez-vous vraiment ajouter ce produit ?")) return;

  const formData = new FormData(e.target);
  const data = {};
  formData.forEach((val, key) => data[key] = val);

  const type = data.type;
  let endpoint = '';

  if (type === 'client' && clientId) {
    endpoint = `${API_BASE_URL}/api/produits/client/${clientId}`;
  } else {
    endpoint = `${API_BASE_URL}/api/produits`;
  }

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });

    if (res.ok) {
      alert('Produit ajouté avec succès !');
    } else {
      const err = await res.json();
      alert('Erreur : ' + err.erreur);
    }
  } catch (err) {
    alert("Erreur réseau");
    console.error(err);
  }
});

// === MISE À JOUR ===
document.getElementById('btn-update').addEventListener('click', async () => {
  if (!confirm("Voulez-vous vraiment mettre à jour ce produit ?")) return;

  const formData = new FormData(document.getElementById('form-produit'));
  const data = {};
  formData.forEach((val, key) => data[key] = val);

  const res = await fetch(`${API_BASE_URL}/api/produit/${produitId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });

  if (res.ok) {
    notify("Produit mis à jour !");
  } else {
    const err = await res.json();
    alert("Erreur : " + err.erreur);
  }
});

// === SUPPRESSION ===
document.getElementById('btn-delete').addEventListener('click', async () => {
  if (!confirm("Êtes-vous sûr de vouloir supprimer ce produit ?")) return;

  const res = await fetch(`${API_BASE_URL}/api/produit/${produitId}`, {
    method: 'DELETE'
  });

  if (res.ok) {
    alert("Produit supprimé.");
    window.location.href = '../index.html';
  } else {
    const err = await res.json();
    alert("Erreur : " + err.erreur);
  }
});

// === NOTIFICATION ===
function notify(message) {
  if (Notification.permission !== 'granted') {
    Notification.requestPermission().then(permission => {
      if (permission === 'granted') {
        new Notification('FixEl', { body: message });
      } else {
        alert(message);
      }
    });
  } else {
    new Notification('FixEl', { body: message });
  }
}

// === AJOUTER RÉPARATION ===
document.getElementById('btn-ajouter-reparation').addEventListener('click', () => {
  window.location.href = `../reparation/reparation.html?produit=${produitId}`;
});

function formatSavNumber(numero) {
  return numero ? `SAV-${String(numero).padStart(4, '0')}` : '-';
}

function formatClientSav(client = {}) {
  return [client.nom, client.prenom].filter(Boolean).join(' ') || '-';
}

function formatDateSav(valeur) {
  if (!valeur) return '-';
  const date = new Date(valeur);
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleDateString('fr-CA');
}

function formatGarantieSav(retour) {
  if (retour.warrantyComputedStatus === 'active') return 'Active';
  if (retour.warrantyComputedStatus === 'expiree') return 'Expiree';
  if (retour.warrantyComputedStatus === 'aucune') return 'Aucune';
  if (retour.warrantyStatus === 'oui') return 'Oui';
  if (retour.warrantyStatus === 'non') return 'Non';
  return 'A verifier';
}

function formatStatutSav(statut) {
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

function echapperHtmlSav(valeur) {
  return (valeur || '').toString().replace(/[&<>"']/g, caractere => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[caractere]));
}
