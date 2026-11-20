const champRecherche = document.getElementById('client-search');
const tableauClients = document.getElementById('client-table-body');

async function chargerClients() {
  const reponse = await fetch('/api/clients');
  if (!reponse.ok) {
    throw new Error(`HTTP ${reponse.status}`);
  }
  const clients = await reponse.json();

  const filtrerClients = () => {
    const recherche = champRecherche.value.trim().toLowerCase();
    const nomRecherche = sansAccents(recherche);
    const telephoneRecherche = normaliserTelephone(recherche);
    const resultats = recherche ? clients.filter(client =>
      sansAccents(client.nom).includes(nomRecherche) ||
      sansAccents(client.prenom).includes(nomRecherche) ||
      (client.email ?? '').toLowerCase().includes(recherche) ||
      (telephoneRecherche !== '' && normaliserTelephone(client.telephone).includes(telephoneRecherche))
    ) : clients;

    afficherClients(resultats);
  };

  champRecherche.addEventListener('input', filtrerClients);
  filtrerClients();
}

function sansAccents(valeur) {
  return (valeur ?? '').toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
}

function normaliserTelephone(valeur) {
  return (valeur ?? '').replace(/[\s()-]/g, '');
}

function afficherClients(clients) {
  if (clients.length === 0) {
    afficherMessage('Aucun client trouvé');
    return;
  }

  const lignes = document.createDocumentFragment();
  for (const client of clients) {
    const ligne = document.createElement('tr');
    const lien = `client.html?id=${encodeURIComponent(client._id)}`;
    ligne.onclick = () => {
      window.location.href = lien;
    };
    ligne.innerHTML = `
      <td><a href="${lien}">${echapperHtml(client.nom)}</a></td>
      <td>${echapperHtml(client.prenom)}</td>
      <td>${echapperHtml(client.telephone)}</td>
      <td>${echapperHtml(client.email)}</td>
      <td>${echapperHtml(client.datecreationFormatte)}</td>
    `;
    lignes.appendChild(ligne);
  }
  tableauClients.replaceChildren(lignes);
}

function afficherMessage(message) {
  const ligne = document.createElement('tr');
  const cellule = ligne.insertCell();
  cellule.colSpan = 5;
  cellule.textContent = message;
  tableauClients.replaceChildren(ligne);
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

chargerClients().catch(erreur => {
  console.error('Erreur lors du chargement des clients', erreur);
  afficherMessage('Impossible de charger les clients');
});
