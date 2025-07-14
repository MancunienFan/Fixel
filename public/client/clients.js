/*
document.addEventListener('DOMContentLoaded', () => {
  fetch('/api/clients')
    .then(res => res.json())
    .then(clients => {
      const tbody = document.getElementById('client-table-body');
      clients.forEach(client => {
        const tr = document.createElement('tr');
        tr.style.cursor = 'pointer';
        tr.addEventListener('click', () => {
          window.location.href = `/client.html?id=${client._id}`;
        });

        tr.innerHTML = `
          <td>${client.nom}</td>
          <td>${client.prenom}</td>
          <td>${client.telephone}</td>
          <td>${client.email}</td>
          <td>${new Date(client.dateCreation).toLocaleDateString()}</td>
        `;
        tbody.appendChild(tr);
      });
    });
});*/

 async function chargerClients() {
      const res = await fetch('/api/clients');
      const clients = await res.json();
      const tbody = document.getElementById('client-table-body');

      clients.forEach(client => {
        const tr = document.createElement('tr');
         tr.onclick = () => {
            window.location.href = `client.html?id=${client._id}`;
          };
        tr.innerHTML = `
          <td><a href="client.html?id=${client._id}">${client.nom}</a></td>
          <td>${client.prenom}</td>
          <td>${client.telephone}</td>
          <td>${client.email}</td>
          <td>${client.datecreationFormatte}</td>
        `;
        tbody.appendChild(tr);
      });
    }

    chargerClients();