const token = localStorage.getItem('token');
const role = localStorage.getItem('role');

if (!token || role !== 'admin') {
  alert('Acces reserve aux administrateurs.');
  window.location.href = '/login/login.html';
}

const btnAjouterUtilisateur = document.getElementById('btn-ajouter-utilisateur');
if (btnAjouterUtilisateur) {
  btnAjouterUtilisateur.addEventListener('click', () => {
    window.location.href = '/admin/utilisateur-nouveau.html';
  });
}

chargerUtilisateurs();

async function chargerUtilisateurs() {
  const tbody = document.querySelector('#utilisateur-table tbody');
  tbody.innerHTML = '<tr><td colspan="8">Chargement des utilisateurs...</td></tr>';

  try {
    const res = await fetch('/api/utilisateurs/liste', {
      headers: { Authorization: `Bearer ${token}` }
    });
    const utilisateurs = await res.json();

    if (!res.ok) throw new Error(utilisateurs.erreur || 'Chargement impossible.');

    tbody.innerHTML = '';
    if (!utilisateurs.length) {
      tbody.innerHTML = '<tr><td colspan="8">Aucun utilisateur.</td></tr>';
      return;
    }

    utilisateurs.forEach(utilisateur => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${echapperHtml(utilisateur.nom || '-')}</td>
        <td>${echapperHtml(utilisateur.email || '-')}</td>
        <td>
          <select data-role-user="${utilisateur._id}">
            <option value="admin" ${utilisateur.role === 'admin' ? 'selected' : ''}>admin</option>
            <option value="mod" ${utilisateur.role === 'mod' ? 'selected' : ''}>mod</option>
            <option value="consultant" ${utilisateur.role === 'consultant' ? 'selected' : ''}>consultant</option>
          </select>
        </td>
        <td>${echapperHtml(formatStatutUtilisateur(utilisateur))}</td>
        <td>${formatDateHeure(utilisateur.invitedAt)}</td>
        <td>${formatDateHeure(utilisateur.activatedAt)}</td>
        <td>${formatDateHeure(utilisateur.derniereConnexion)}</td>
        <td>
          ${['invited', 'expired'].includes(utilisateur.status) ? `
            <button type="button" class="table-action" data-resend-user="${utilisateur._id}">Renvoyer invitation</button>
          ` : ''}
          ${['invited', 'expired'].includes(utilisateur.status) ? '' : `
            <button type="button" class="table-action" data-toggle-user="${utilisateur._id}" data-actif="${utilisateur.actif !== false}">
              ${utilisateur.actif === false ? 'Reactiver' : 'Desactiver'}
            </button>
          `}
          <button type="button" class="table-action btn-danger" data-delete-user="${utilisateur._id}">Supprimer</button>
        </td>
      `;
      tbody.appendChild(tr);
    });

    tbody.querySelectorAll('[data-role-user]').forEach(select => {
      select.addEventListener('change', () => changerRole(select.dataset.roleUser, select.value));
    });

    tbody.querySelectorAll('[data-toggle-user]').forEach(button => {
      button.addEventListener('click', () => changerStatutUtilisateur(
        button.dataset.toggleUser,
        button.dataset.actif !== 'true'
      ));
    });

    tbody.querySelectorAll('[data-resend-user]').forEach(button => {
      button.addEventListener('click', () => renvoyerInvitation(button.dataset.resendUser));
    });

    tbody.querySelectorAll('[data-delete-user]').forEach(button => {
      button.addEventListener('click', () => supprimerUtilisateur(button.dataset.deleteUser));
    });
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="8">${echapperHtml(err.message)}</td></tr>`;
  }
}

async function changerRole(id, nouveauRole) {
  const res = await fetch(`/api/utilisateurs/${id}/role`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({ role: nouveauRole })
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    alert(`Erreur : ${data.erreur || 'Role non mis a jour.'}`);
    chargerUtilisateurs();
    return;
  }

  alert('Role mis a jour.');
}

async function changerStatutUtilisateur(id, actif) {
  const libelle = actif ? 'reactiver' : 'desactiver';
  if (!confirm(`Voulez-vous ${libelle} cet utilisateur ?`)) return;

  const res = await fetch(`/api/utilisateurs/${id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({ actif })
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    alert(`Erreur : ${data.erreur || 'Statut non mis a jour.'}`);
    return;
  }

  chargerUtilisateurs();
}

async function renvoyerInvitation(id) {
  if (!confirm('Renvoyer une invitation a cet utilisateur ?')) return;

  const res = await fetch(`/api/utilisateurs/resend-invitation/${id}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` }
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    alert(`Erreur : ${data.erreur || 'Invitation non renvoyee.'}`);
    return;
  }

  alert('Invitation renvoyee.');
  chargerUtilisateurs();
}

async function supprimerUtilisateur(id) {
  if (!confirm('Supprimer cet utilisateur ?')) return;

  const res = await fetch(`/api/utilisateurs/${id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` }
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    alert(`Erreur : ${data.erreur || 'Suppression impossible.'}`);
    return;
  }

  chargerUtilisateurs();
}

function formatDate(valeur) {
  if (!valeur) return '-';
  const date = new Date(valeur);
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleDateString('fr-CA');
}

function formatDateHeure(valeur) {
  if (!valeur) return '-';
  const date = new Date(valeur);
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleString('fr-CA');
}

function formatStatutUtilisateur(utilisateur) {
  const statuts = {
    invited: 'Invite',
    active: 'Actif',
    disabled: 'Desactive',
    expired: 'Invitation expiree'
  };

  if (utilisateur.status && statuts[utilisateur.status]) return statuts[utilisateur.status];
  return utilisateur.actif === false ? 'Desactive' : 'Actif';
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
