const params = new URLSearchParams(window.location.search);
const token = params.get('token');
const message = document.getElementById('invitation-message');
const form = document.getElementById('form-accept-invitation');

document.getElementById('btn-login').addEventListener('click', () => {
  window.location.href = '/login/login.html';
});

initialiserInvitation();

async function initialiserInvitation() {
  if (!token) {
    message.textContent = 'Lien invitation invalide.';
    return;
  }

  try {
    const res = await fetch(`/api/utilisateurs/invite/${encodeURIComponent(token)}`);
    const data = await res.json();

    if (!res.ok) {
      message.textContent = data.erreur || 'Invitation invalide ou expiree.';
      return;
    }

    message.textContent = `Bonjour ${data.nom || data.email}, creez votre mot de passe pour activer votre compte Fixel.`;
    form.style.display = 'grid';
  } catch (err) {
    message.textContent = 'Impossible de verifier cette invitation.';
  }
}

form.addEventListener('submit', async event => {
  event.preventDefault();

  const motdepasse = document.getElementById('motdepasse').value;
  const confirmation = document.getElementById('confirmation').value;

  if (!motdepasse || motdepasse.length < 12) {
    alert('Le mot de passe doit contenir au moins 12 caracteres.');
    return;
  }

  if (motdepasse !== confirmation) {
    alert('La confirmation ne correspond pas.');
    return;
  }

  const res = await fetch('/api/utilisateurs/accept-invitation', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, motdepasse })
  });
  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    alert(data.erreur || 'Activation impossible.');
    return;
  }

  alert('Compte active. Vous pouvez maintenant vous connecter.');
  window.location.href = '/login/login.html';
});
