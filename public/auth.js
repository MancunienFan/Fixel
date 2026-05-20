const LOGIN_URL = '/login/login.html';

function nettoyerSession() {
  localStorage.removeItem('token');
  localStorage.removeItem('role');
  sessionStorage.removeItem('token');
  sessionStorage.removeItem('role');

  ['token', 'authToken', 'jwt', 'role'].forEach(nom => {
    document.cookie = `${nom}=; Max-Age=0; path=/`;
    document.cookie = `${nom}=; Max-Age=0; path=/; SameSite=Lax`;
  });
}

function redirectLogin() {
  if (window.location.pathname !== LOGIN_URL) {
    window.location.replace(LOGIN_URL);
  }
}

function logout(options = {}) {
  nettoyerSession();
  if (options.message) {
    alert(options.message);
  }
  redirectLogin();
}

function lirePayloadToken(token) {
  const partiePayload = token.split('.')[1];
  if (!partiePayload) {
    throw new Error('Token invalide.');
  }

  const base64 = partiePayload.replace(/-/g, '+').replace(/_/g, '/');
  const base64Complete = base64.padEnd(base64.length + ((4 - base64.length % 4) % 4), '=');
  return JSON.parse(atob(base64Complete));
}

function checkTokenExpiration() {
  const token = localStorage.getItem('token');
  if (!token) {
    logout();
    return false;
  }

  try {
    const payload = lirePayloadToken(token);
    if (!payload.exp) {
      logout();
      return false;
    }

    const expiration = payload.exp * 1000;
    const tempsRestant = expiration - Date.now();

    if (tempsRestant <= 0) {
      logout({ message: 'Votre session a expire. Vous allez etre deconnecte.' });
      return false;
    }

    window.setTimeout(() => {
      logout({ message: 'Votre session a expire. Vous allez etre deconnecte.' });
    }, tempsRestant);

    return true;
  } catch (e) {
    logout();
    return false;
  }
}

(function ajouterTokenAuxRequetesApi() {
  const fetchOriginal = window.fetch.bind(window);

  window.fetch = async (resource, options = {}) => {
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

    const response = await fetchOriginal(resource, {
      ...options,
      headers
    });

    if (response.status === 401 || response.status === 403) {
      logout();
    }

    return response;
  };
})();

window.FixelAuth = {
  checkTokenExpiration,
  logout,
  redirectLogin
};

checkTokenExpiration();
