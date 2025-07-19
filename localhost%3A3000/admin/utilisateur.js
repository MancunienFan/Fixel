const token = localStorage.getItem('token');
        const role = localStorage.getItem('role');

        if (!token || role !== 'admin') {
            alert("Accès réservé aux administrateurs.");
            window.location.href = '../login/login.html';
        }

        fetch('/api/utilisateurs/liste', {
            headers: {
                 Authorization: `Bearer ${localStorage.getItem('token')}`
                }
        })
            .then(res => res.json())
            .then(utilisateurs => {
                const tbody = document.querySelector('#utilisateur-table tbody');
                utilisateurs.forEach(u => {
                    const row = `<tr>
    <td>${u.nom}</td>
    <td>${u.email}</td>
    <td>
      <select onchange="changerRole('${u._id}', this.value)">
        <option value="admin" ${u.role === 'admin' ? 'selected' : ''}>admin</option>
        <option value="mod" ${u.role === 'mod' ? 'selected' : ''}>mod</option>
        <option value="consultant" ${u.role === 'consultant' ? 'selected' : ''}>consultant</option>
      </select>
    </td>
    <td>
      <button onclick="supprimerUtilisateur('${u._id}')">Supprimer</button>
    </td>
  </tr>`;
                    tbody.innerHTML += row;
                });
            });

        function logout() {
            localStorage.removeItem('token');
            localStorage.removeItem('role');
            window.location.href = '../login/login.html';
        }

        async function changerRole(id, role) {
            const res = await fetch(`/api/utilisateurs/${id}/role`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + token
                },
                body: JSON.stringify({ role })
            });
            if (res.ok) {
                alert("Rôle mis à jour.");
            } else {
                const data = await res.json();
                alert("Erreur : " + data.erreur);
            }
        }

        async function supprimerUtilisateur(id) {
            if (!confirm("Supprimer cet utilisateur ?")) return;

            const res = await fetch(`/api/utilisateurs/${id}`, {
                method: 'DELETE',
                headers: { 'Authorization': 'Bearer ' + token }
            });

            if (res.ok) {
                alert("Utilisateur supprimé.");
                location.reload();
            } else {
                const data = await res.json();
                alert("Erreur : " + data.erreur);
            }
        }