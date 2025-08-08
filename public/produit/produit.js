// Lire l'ID dans l'URL
const params = new URLSearchParams(window.location.search);
const produitId = params.get("id");
const clientId = params.get("clientId");
const API_BASE_URL = window.location.origin;

const token = localStorage.getItem('token');
const role = localStorage.getItem('role');

if (!token) {
  window.location.href = '/login.html';
} else if (role !== 'admin' && role !== 'mod') {
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
        mettreAJourVisibiliteFacture();

      })
      .catch(err => {
        alert("Erreur lors du chargement du produit : " + err.message);
      });

    chargerReparations();
  } else {
    // En mode ajout : cacher update/delete
    document.getElementById('btn-update').style.display = 'none';
    document.getElementById('btn-delete').style.display = 'none';
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


  const disponibiliteSelect = document.getElementById('disponibilite');
const factureBtn = document.getElementById('btn-generer-facture');

// Fonction pour afficher ou cacher le bouton
function mettreAJourVisibiliteFacture() {
  const estVendu = disponibiliteSelect.value === 'vendu';
  const produitId = new URLSearchParams(window.location.search).get('id');

  if (estVendu && produitId) {
    factureBtn.style.display = 'inline-block';
  } else {
    factureBtn.style.display = 'none';
  }
}

// Mise à jour initiale et au changement de statut
mettreAJourVisibiliteFacture();
disponibiliteSelect.addEventListener('change', mettreAJourVisibiliteFacture);

// Action au clic sur le bouton
factureBtn.addEventListener('click', () => {
  const produitId = new URLSearchParams(window.location.search).get('id');
  if (!produitId) return;

  // Redirection vers la génération de facture
 window.location.href = `../facture/facture.html?produitId=${produitId}`;

});


});
