

const API_BASE_URL = window.location.origin;
const params = new URLSearchParams(window.location.search);
const reparationId = params.get('id');
const produitId = params.get('produit');

// Préremplir l'ID du produit
document.getElementById('produitId').value = produitId;

// Cacher boutons maj/suppr si en ajout
if (!reparationId) {
  document.getElementById('btn-update').style.display = 'none';
  document.getElementById('btn-delete').style.display = 'none';
}

// Remplir les champs si mode édition
if (reparationId) {
  fetch(`${API_BASE_URL}/api/reparations/${reparationId}`)
    .then(res => res.json())
    .then(r => {
      for (const [key, val] of Object.entries(r)) {
        const champ = document.querySelector(`[name="${key}"]`);
        if (champ) champ.value = key === "date" ? val.substr(0, 10) : val;
      }
    });

  const btnEnregistrer = document.getElementById('btn-enregistrer');
  if (btnEnregistrer) {
    btnEnregistrer.disabled = true;
    btnEnregistrer.style.opacity = 0.6;
    btnEnregistrer.style.cursor = 'not-allowed';
    btnEnregistrer.title = "Désactivé en mode consultation";
}
    
}

// ENREGISTRER
document.getElementById('form-reparation').addEventListener('submit', async (e) => {
  e.preventDefault();

  if (!confirm("Confirmer l'enregistrement de cette réparation ?")) return;

  const formData = new FormData(e.target);
  const data = {};
  formData.forEach((v, k) => data[k] = v);
    // ✅ Debug console
  console.log("📦 Données envoyées à l'API :", data);

  const res = await fetch(`${API_BASE_URL}/api/reparation`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });

  if (res.ok) {
    alert("Réparation enregistrée !");
    //window.location.href = `produit.html?id=${produitId}`;
  } else {
    alert("Erreur lors de l'ajout");
  }
});

// MISE À JOUR
document.getElementById('btn-update').addEventListener('click', async () => {
  if (!confirm("Confirmer la mise à jour ?")) return;

  const formData = new FormData(document.getElementById('form-reparation'));
  const data = {};
  formData.forEach((v, k) => data[k] = v);

  const res = await fetch(`${API_BASE_URL}/api/reparations/${reparationId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });

  if (res.ok) {
    alert("Réparation mise à jour !");
  //  window.location.href = `produit.html?id=${produitId}`;
  } else {
    alert("Erreur lors de la mise à jour");
  }
});

// SUPPRIMER
document.getElementById('btn-delete').addEventListener('click', async () => {
  if (!confirm("Confirmer la suppression ?")) return;

  const res = await fetch(`${API_BASE_URL}/api/reparations/${reparationId}`, {
    method: 'DELETE'
  });

  if (res.ok) {
    alert("Réparation supprimée !");
    window.location.href = `../produit/produit.html?id=${produitId}`;
  } else {
    alert("Erreur lors de la suppression");
  }
});


//btn retour
document.getElementById('btn-retour').addEventListener('click', () => {
  if (produitId) {
    window.location.href = `../produit/produit.html?id=${produitId}`;
  } else {
    alert("Impossible de revenir au produit : ID manquant.");
  }
});