// navbar.js
window.addEventListener("DOMContentLoaded", () => {
  const role = localStorage.getItem('role'); // Ou récupère depuis req.session dans ejs si serveur
  const navbar = document.getElementById("navbar");


  if (navbar) {
    navbar.innerHTML = `
      <a href="/index.html">Accueil</a>
      ${role === 'admin' ? '<a href="/admin/utilisateurs.html">Utilisateurs</a>' : ''}
      ${role === 'admin' ? '<a href="/client/clients.html">Clients</a>' : ''}
      ${role === 'admin' ? '<a href="/produit/produit.html">Produits</a>' : ''}
       ${role === 'admin' ? '<a href="/facture/facture.html">Facture</a>' : ''}
      <a href="#" onclick="logout()">Déconnexion</a>
    `;
  }
});
