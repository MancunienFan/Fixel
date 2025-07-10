const id = new URLSearchParams(window.location.search).get("id");


if (id) {
  fetch(`/api/clients/${id}`)
    .then(res => res.json())
    .then(client => {
      document.getElementById('clientId').value = client._id;
      document.getElementById('nom').value = client.nom;
      document.getElementById('prenom').value = client.prenom;
      document.getElementById('telephone').value = client.telephone;
      document.getElementById('email').value = client.email;
      document.getElementById('notes').value = client.notes;
    });
}
document.getElementById('form-client').addEventListener('submit', async (e) => {
  e.preventDefault(); // empêche le rechargement de la page

  const client = {
    nom: document.getElementById('nom').value,
    prenom: document.getElementById('prenom').value,
    telephone: document.getElementById('telephone').value,
    email: document.getElementById('email').value,
    notes: document.getElementById('notes').value,
  };

  await fetch('/api/clients', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(client)
  });

  alert('Client enregistré');
  // window.location.href = 'clients.html';
});


document.getElementById('btn-update').onclick = async () => {
  const clientId = document.getElementById('clientId').value;

  const client = {
    nom: document.getElementById('nom').value,
    prenom: document.getElementById('prenom').value,
    telephone: document.getElementById('telephone').value,
    email: document.getElementById('email').value,
    notes: document.getElementById('notes').value,
  };

  await fetch(`/api/clients/${clientId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(client)
  });

  alert('Client mis à jour');
};

document.getElementById('btn-delete').onclick = async () => {
  const clientId = document.getElementById('clientId').value;
  const confirmation = confirm("Voulez-vous vraiment supprimer ce client ?");
  if (!confirmation) return;

  await fetch(`/api/clients/${clientId}`, {
    method: 'DELETE'
  });

  alert('Client supprimé');
  window.location.href = 'clients.html';
};
