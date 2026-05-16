(function verifierConnexion() {
  const token = localStorage.getItem('token');
  if (!token) {
    window.location.href = '/login/login.html';
  }
})();

(function ajouterTokenAuxRequetesApi() {
  const fetchOriginal = window.fetch.bind(window);

  window.fetch = (resource, options = {}) => {
    const url = typeof resource === 'string' ? resource : resource.url;
    const estApiLocale = url && (
      url.startsWith('/api') ||
      url.startsWith(window.location.origin + '/api')
    );

    if (!estApiLocale) {
      return fetchOriginal(resource, options);
    }

    const token = localStorage.getItem('token');
    const headers = new Headers(options.headers || {});

    if (token && !headers.has('Authorization')) {
      headers.set('Authorization', `Bearer ${token}`);
    }

    return fetchOriginal(resource, {
      ...options,
      headers
    });
  };
})();

function logout() {
  localStorage.removeItem('token');
  localStorage.removeItem('role');
  alert('Votre session a expire. Vous allez etre deconnecte.');
  window.location.href = '/login/login.html';
}

function checkTokenExpiration() {
  const token = localStorage.getItem('token');
  if (!token) {
    window.location.href = '/login/login.html';
    return;
  }

  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    const expiration = payload.exp * 1000;
    const now = Date.now();

    if (now >= expiration) {
      logout();
    } else {
      setTimeout(() => {
        logout();
      }, expiration - now);
    }
  } catch (e) {
    logout();
  }
}
