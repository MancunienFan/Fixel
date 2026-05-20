// sidebar.js - Menu vertical latéral rétractable
(function appliquerThemeInitial() {
  const theme = localStorage.getItem('theme') || 'light';
  document.documentElement.dataset.theme = theme;
})();

window.addEventListener("DOMContentLoaded", () => {
  const role = localStorage.getItem('role');
  const sidebar = document.getElementById("sidebar");

  if (!sidebar) return;

  // Récupérer l'état du menu depuis localStorage
  const menuOuvert = localStorage.getItem('sidebarOpen') !== 'false';

  sidebar.innerHTML = `
    <div class="sidebar-header">
      <span class="sidebar-logo">FixEl</span>
      <button type="button" id="sidebarToggle" class="sidebar-toggle" aria-label="Fermer le menu">
        <span class="sidebar-toggle-icon">◀</span>
      </button>
    </div>
    <nav class="sidebar-nav">
      <a href="/index.html" class="sidebar-link" data-icon="🏠">
        <span class="sidebar-link-icon">🏠</span>
        <span class="sidebar-link-text">Accueil</span>
      </a>
      ${role === 'admin' ? `
        <a href="/dashboard/dashboard.html" class="sidebar-link" data-icon="📊">
          <span class="sidebar-link-icon">📊</span>
          <span class="sidebar-link-text">Tableau de bord</span>
        </a>
        <a href="/atelier/atelier.html" class="sidebar-link" data-icon="🔧">
          <span class="sidebar-link-icon">🔧</span>
          <span class="sidebar-link-text">Atelier</span>
        </a>
        <a href="/reparation/reparations.html" class="sidebar-link" data-icon="🛠️">
          <span class="sidebar-link-icon">🛠️</span>
          <span class="sidebar-link-text">Réparations</span>
        </a>
        <a href="/sav/sav.html" class="sidebar-link" data-icon="SAV">
          <span class="sidebar-link-icon">SAV</span>
          <span class="sidebar-link-text">Retours / SAV</span>
        </a>
        <a href="/admin/utilisateurs.html" class="sidebar-link" data-icon="👥">
          <span class="sidebar-link-icon">👥</span>
          <span class="sidebar-link-text">Utilisateurs</span>
        </a>
        <a href="/admin/data-quality.html" class="sidebar-link" data-icon="✅">
          <span class="sidebar-link-icon">✅</span>
          <span class="sidebar-link-text">Qualité données</span>
        </a>
        <a href="/client/clients.html" class="sidebar-link" data-icon="👤">
          <span class="sidebar-link-icon">👤</span>
          <span class="sidebar-link-text">Clients</span>
        </a>
        <a href="/produit/produit.html" class="sidebar-link" data-icon="📦">
          <span class="sidebar-link-icon">📦</span>
          <span class="sidebar-link-text">Produits</span>
        </a>
        <a href="/facture/facture.html" class="sidebar-link" data-icon="📄">
          <span class="sidebar-link-icon">📄</span>
          <span class="sidebar-link-text">Facture</span>
        </a>
      ` : ''}
      <a href="#" onclick="logout()" class="sidebar-link sidebar-link-logout" data-icon="🚪">
        <span class="sidebar-link-icon">🚪</span>
        <span class="sidebar-link-text">Déconnexion</span>
      </a>
    </nav>
    <div class="sidebar-footer">
      <button type="button" id="themeToggle" class="theme-toggle" aria-label="Activer le mode sombre" aria-pressed="false">
        <span class="theme-toggle-track">
          <span class="theme-toggle-thumb">
            <span class="theme-toggle-icon" aria-hidden="true">☀</span>
          </span>
        </span>
      </button>
    </div>
  `;

  // Appliquer l'état initial du menu
  appliquerEtatSidebar(menuOuvert);

  // Initialiser le toggle du menu
  const sidebarToggle = document.getElementById('sidebarToggle');
  if (sidebarToggle) {
    sidebarToggle.addEventListener('click', () => {
      const estOuvert = sidebar.classList.toggle('sidebar-open');
      localStorage.setItem('sidebarOpen', estOuvert);
      appliquerEtatSidebar(estOuvert);
    });
  }

  // Initialiser le toggle de thème
  initialiserThemeToggle();
});

function appliquerEtatSidebar(estOuvert) {
  const sidebar = document.getElementById('sidebar');
  const toggleIcon = document.querySelector('.sidebar-toggle-icon');

  if (!sidebar) return;

  document.body.classList.add('sidebar-layout');
  document.body.classList.toggle('sidebar-expanded', estOuvert);
  document.body.classList.toggle('sidebar-collapsed', !estOuvert);

  if (estOuvert) {
    sidebar.classList.add('sidebar-open');
    if (toggleIcon) toggleIcon.textContent = '◀';
  } else {
    sidebar.classList.remove('sidebar-open');
    if (toggleIcon) toggleIcon.textContent = '▶';
  }
}

function initialiserThemeToggle() {
  const bouton = document.getElementById('themeToggle');
  if (!bouton) return;

  const appliquerEtat = () => {
    const theme = document.documentElement.dataset.theme || 'light';
    const sombre = theme === 'dark';
    const icon = bouton.querySelector('.theme-toggle-icon');

    bouton.classList.toggle('active', sombre);
    bouton.setAttribute('aria-pressed', sombre ? 'true' : 'false');
    bouton.setAttribute('aria-label', sombre ? 'Désactiver le mode sombre' : 'Activer le mode sombre');
    if (icon) icon.textContent = sombre ? '☾' : '☀';
  };

  appliquerEtat();

  bouton.addEventListener('click', () => {
    const prochainTheme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = prochainTheme;
    localStorage.setItem('theme', prochainTheme);
    appliquerEtat();
  });
}

function logout() {
  if (window.FixelAuth) {
    window.FixelAuth.logout();
    return;
  }

  localStorage.removeItem('token');
  localStorage.removeItem('role');
  sessionStorage.removeItem('token');
  sessionStorage.removeItem('role');
  window.location.href = '/login/login.html';
}
