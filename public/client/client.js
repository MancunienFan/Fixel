
const API_BASE_URL = window.location.origin; // ou localhost
window.addEventListener('DOMContentLoaded', () => {
  const id = new URLSearchParams(window.location.search).get("id");
  


  if (id) {
    const btnEnregistrer = document.getElementById('submit');
    if (btnEnregistrer) {
      btnEnregistrer.disabled = true;
      btnEnregistrer.style.opacity = 0.6;
      btnEnregistrer.style.cursor = 'not-allowed';
      btnEnregistrer.title = "Désactivé en consultation";
    }

    fetch(`/api/clients/${id}`)
      .then(res => {
        if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
        return res.json();
      })
      .then(client => {
        document.getElementById('clientId').value = client._id || "";
        document.getElementById('nom').value = client.nom || "";
        document.getElementById('prenom').value = client.prenom || "";
        document.getElementById('telephone').value = client.telephone || "";
        document.getElementById('email').value = client.email || "";
        document.getElementById('notes').value = client.notes || "";
        document.getElementById('dateCreation').value = formatDate(client.dateCreation);
        document.getElementById('dateModification').value = formatDate(client.dateModification);

          // ⬇️ Charger les produits associées
      chargerProduits(client._id);
      })
      .catch(err => {
        alert("Erreur lors du chargement du client. Voir console.");
        console.error(err);
      });
  }



  document.getElementById('form-client').addEventListener('submit', async (e) => {
    e.preventDefault();

    const client = {
      nom: document.getElementById('nom').value,
      prenom: document.getElementById('prenom').value,
      telephone: document.getElementById('telephone').value,
      email: document.getElementById('email').value,
      notes: document.getElementById('notes').value,
    };

    try {
      await fetch(`${API_BASE_URL}/api/clients`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(client)
      });
      alert('Client enregistré');
      // window.location.href = 'clients.html';
    } catch (err) {
      alert('Erreur lors de l\'enregistrement');
      console.error(err);
    }
  });

  document.getElementById('btn-update').onclick = async () => {
    const clientId = document.getElementById('clientId').value;
    if (!clientId) {
      alert("Aucun client chargé pour mise à jour.");
      return;
    }
    const client = {
      nom: document.getElementById('nom').value,
      prenom: document.getElementById('prenom').value,
      telephone: document.getElementById('telephone').value,
      email: document.getElementById('email').value,
      notes: document.getElementById('notes').value,
    };

    try {
      await fetch(`${API_BASE_URL}/api/clients/${clientId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(client)
      });
      alert('Client mis à jour');
    } catch (err) {
      alert('Erreur lors de la mise à jour');
      console.error(err);
    }
  };

  document.getElementById('btn-delete').onclick = async () => {
    const clientId = document.getElementById('clientId').value;
    if (!clientId) {
      alert("Aucun client chargé pour suppression.");
      return;
    }

    if (!confirm("Voulez-vous vraiment supprimer ce client ?")) return;

    try {
      await fetch(`${API_BASE_URL}/api/clients/${clientId}`, {
        method: 'DELETE'
      });
      alert('Client supprimé');
      window.location.href = 'clients.html';
    } catch (err) {
      alert('Erreur lors de la suppression');
      console.error(err);
    }
  };
});

// Fonction pour gérer le clic sur le bouton
document.getElementById("btn-ajout-reparation").addEventListener("click", () => {
  const clientId = document.getElementById('clientId').value;
  if (clientId) {
    window.location.href = `../produit/produit.html?clientId=${clientId}`;
  }
});



function chargerProduits(clientId) {
  fetch(`${API_BASE_URL}/api/produits/client/${clientId}`)
    .then(res => res.json())
    .then(produits => {
      if (!produits || produits.length === 0) return;

      const section = document.getElementById('produits-section');
      const tbody = document.getElementById('produits-table').querySelector('tbody');

   produits.forEach(produit => {
  const tr = document.createElement('tr');
  tr.classList.add('clickable-row');
  tr.style.cursor = "pointer";
  tr.addEventListener('click', () => {
    window.location.href = `../produit/produit.html?id=${produit._id}`;
  });

  tr.innerHTML = `
    <td>${produit.model || ''}</td>
    <td>${produit.nom || ''}</td>
    <td>${produit.imei || ''}</td>
    <td>${produit.datemodificationFormatee}</td>
  `;
  tbody.appendChild(tr);
});


      section.style.display = 'block';
    })
    .catch(err => console.error('Erreur chargement produits:', err));
}
  function formatDate(dateString) {
    if (!dateString) return '';
    const date = new Date(dateString);
    const annee = date.getFullYear();
    const mois = String(date.getMonth() + 1).padStart(2, '0'); // Mois de 0 à 11 → +1
    const jour = String(date.getDate()).padStart(2, '0');
    return `${annee}/${mois}/${jour}`;
  }