window.addEventListener('DOMContentLoaded', () => {
      const id = new URLSearchParams(window.location.search).get("id");
      if (id) {
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
          await fetch('/api/clients', {
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
          await fetch(`/api/clients/${clientId}`, {
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
          await fetch(`/api/clients/${clientId}`, {
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