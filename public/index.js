
  
    /*
const role = localStorage.getItem('role');
const navbar = document.getElementById('navbar');

//${role === 'admin' || role === 'mod' ? '<a href="/produit/produit.html">Produits</a>' : ''}
if (navbar) {
 navbar.innerHTML = `
  <a href="/index.html">Accueil</a>
  ${role === 'admin' ? '<a href="/admin/utilisateurs.html">Utilisateurs</a>' : ''}
  ${role === 'admin' ? '<a href="client/clients.html">Clients</a>' : ''}
  ${role === 'admin' ? '<a href="produit/produit.html">Produits</a>' : ''}
  <a href="/reparation/reparation.html">Réparations</a>
  <a href="#" onclick="logout()">Déconnexion</a>
`;

}*/


    //en local utiliser : http://localhost:3000/api/produits

   let profitTotal = 0;
const profitTotalSpan = document.getElementById('profitTotal');

fetch('/api/produits')
  .then(res => res.json())
  .then(produits => {
    const tbody = document.querySelector('#produitsTable tbody');
    produits.forEach(produit => {
      const tr = document.createElement('tr');
      tr.style.cursor = 'pointer';
      tr.onclick = () => {
        window.location.href = `./produit/produit.html?id=${produit._id}`;
      };

      tr.innerHTML = `
        <td>${produit.nom}</td>
        <td>${produit.statut}</td>
        <td>${produit.prix} $</td>
        <td>${produit.disponibilite}</td>
        <td>${produit.dateachatFormatee}</td>
        <td>${produit.datemodificationFormatee}</td>
      `;
      tbody.appendChild(tr);

      // 🔢 Calcul profit total
if (produit.disponibilite && produit.disponibilite.toLowerCase() === "vendu") {
  const achat = parseFloat(produit.prixachat || 0);
  const vente = parseFloat(produit.prixvente || 0);
  profitTotal += (vente - achat);
}

    });

    profitTotalSpan.textContent = profitTotal.toFixed(2) + " $";
  });


    function logout() {
      localStorage.removeItem('token');
      localStorage.removeItem('role');
      window.location.href = './login/login.html';
    }

    // Exemple : cacher un bouton si ce n’est pas un admin
    if (localStorage.getItem('role') !== 'admin') {
      document.getElementById('btn-supprimer').style.display = 'none';
    }

  