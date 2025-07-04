// Lire l'ID dans l'URL
const params = new URLSearchParams(window.location.search);
const produitId = params.get('id');
const API_BASE_URL = window.location.origin;

const token = localStorage.getItem('token');
const role = localStorage.getItem('role');

if (!token) {
  window.location.href = '/login.html';
} else if (role !== 'admin' && role !== 'mod') {
  alert("Accès refusé.");
  window.location.href = '/index.html';
}


async function chargerReparations() {
  const res = await fetch(`${API_BASE_URL}/api/reparations/produit/${produitId}`);
  const reparations = await res.json();

  if (reparations.length === 0) {
    return; // Pas de réparation à afficher
  }

  document.getElementById('reparations-container').style.display = 'block';

  const tbody = document.querySelector('#table-reparations tbody');
  tbody.innerHTML = ''; // Nettoyer au cas où

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



if (produitId) {
  // On est en mode consultation/modification
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
    })
    .catch(err => {
      alert("Erreur lors du chargement du produit : " + err.message);
    });
    chargerReparations();
}

document.getElementById('form-produit').addEventListener('submit', async (e) => {
  e.preventDefault();

  // Confirmation avant d'ajouter
  const confirmer = confirm("Voulez-vous vraiment ajouter ce produit ?");
  if (!confirmer) return; // Si on annule, on ne fait rien

  const formData = new FormData(e.target);
  const data = {};
  formData.forEach((val, key) => data[key] = val);

  const res = await fetch(`${API_BASE_URL}/api/produits`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });

  if (res.ok) {
    alert('Produit ajouté avec succès !');
   // window.location.href = 'index.html';
  } else {
    const err = await res.json();
    alert('Erreur : ' + err.erreur);
  }
});


// Cacher les boutons "update" et "delete" si on est en mode ajout
if (!produitId) {
  document.getElementById('btn-update').style.display = 'none';
  document.getElementById('btn-delete').style.display = 'none';
}

// Gestion du bouton MISE À JOUR
document.getElementById('btn-update').addEventListener('click', async () => {
  if (!confirm("Voulez-vous vraiment mettre à jour ce produit ?")) return;

  const formData = new FormData(document.getElementById('form-produit'));
  const data = {};
  formData.forEach((val, key) => data[key] = val);

  const res = await fetch(`${API_BASE_URL}/api/produit/${produitId}`, {

  //fetch(`http://localhost:3000/api/produit/${produitId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });

  if (res.ok) {
   // alert('Produit mis à jour avec succès !');
    notify('Produit ajouté avec succès !');
    
  } else {
    const err = await res.json();
    alert('Erreur : ' + err.erreur);
  }
});

// Gestion du bouton EFFACER
document.getElementById('btn-delete').addEventListener('click', async () => {
  if (!confirm("Êtes-vous sûr de vouloir supprimer ce produit ?")) return;

  //https://fixel.onrender.com/api/produit/${produitId}
  const res = await fetch(`${API_BASE_URL}/api/produit/${produitId}`, {
    method: 'DELETE'
  });

  if (res.ok) {
    alert('Produit supprimé.');
    window.location.href = '../index.html';
  } else {
    const err = await res.json();
    alert('Erreur : ' + err.erreur);
  }
});

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

//bouton ajouter réparation
document.getElementById('btn-ajouter-reparation').addEventListener('click', () => {
  window.location.href = `../reparation/reparation.html?produit=${produitId}`;
});
