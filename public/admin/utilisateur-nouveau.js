const token = localStorage.getItem('token');
const roleConnecte = localStorage.getItem('role');
const rolesAutorises = ['admin', 'mod', 'consultant'];

if (!token || roleConnecte !== 'admin') {
  alert("Vous n'avez pas les droits necessaires pour acceder a cette page.");
  window.location.href = '/acces-refuse.html';
}

document.getElementById('btn-retour-utilisateurs').addEventListener('click', () => {
  window.location.href = '/admin/utilisateurs.html';
});

document.getElementById('form-ajout-utilisateur').addEventListener('submit', async event => {
  event.preventDefault();

  const nom = document.getElementById('nom').value.trim();
  const email = document.getElementById('email').value.trim();
  const role = document.getElementById('role').value;

  if (!nom) {
    alert('Nom obligatoire.');
    return;
  }

  if (!email || !email.includes('@')) {
    alert('Email invalide.');
    return;
  }

  if (!rolesAutorises.includes(role)) {
    alert('Role invalide.');
    return;
  }

  const res = await fetch('/api/utilisateurs/invite', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({ nom, email, role })
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    alert(`Erreur : ${data.erreur || 'Invitation impossible.'}`);
    return;
  }

  alert('Invitation envoyee.');
  window.location.href = '/admin/utilisateurs.html';
});
