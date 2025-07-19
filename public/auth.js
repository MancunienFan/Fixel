(function verifierConnexion() {
  const token = localStorage.getItem('token');
  if (!token) {
    window.location.href = './login/login.html';
  }
})();


// Fonction pour déconnecter l'utilisateur
function logout() {
  localStorage.removeItem('token');
  alert('Votre session a expiré. Vous allez être déconnecté.');
  window.location.href = '/login.html';  // ou ta page de login
}

// Fonction qui vérifie le token et planifie la déconnexion automatique
function checkTokenExpiration() {
  const token = localStorage.getItem('token');
  if (!token) {
    // Pas de token : redirige vers login
    window.location.href = '/login.html';
    return;
  }

  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    const expiration = payload.exp * 1000; // millisecondes
    const now = Date.now();

    if (now >= expiration) {
      logout();
    } else {
      // Planifie la déconnexion à l'expiration
      setTimeout(() => {
        logout();
      }, expiration - now);
    }
  } catch (e) {
    // Token mal formé ou autre erreur
    logout();
  }
}
