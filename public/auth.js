(function verifierConnexion() {
  const token = localStorage.getItem('token');
  if (!token) {
    window.location.href = './login/login.html';
  }
})();
