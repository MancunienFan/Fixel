// navbar.js
(function appliquerThemeInitial() {
  const theme = localStorage.getItem('theme') || 'light';
  document.documentElement.dataset.theme = theme;
})();

window.addEventListener("DOMContentLoaded", () => {
  const role = localStorage.getItem('role');
  const navbar = document.getElementById("navbar");

  if (!navbar) return;

  navbar.innerHTML = `
    <div class="navbar-links">
      <a href="/index.html">Accueil</a>
      ${role === 'admin' ? '<a href="/admin/utilisateurs.html">Utilisateurs</a>' : ''}
      ${role === 'admin' ? '<a href="/client/clients.html">Clients</a>' : ''}
      ${role === 'admin' ? '<a href="/produit/produit.html">Produits</a>' : ''}
      ${role === 'admin' ? '<a href="/facture/facture.html">Facture</a>' : ''}
      <a href="#" onclick="logout()">Déconnexion</a>
    </div>
    <div class="navbar-actions">
      <button type="button" id="themeToggle" class="theme-toggle" aria-label="Activer le mode sombre" aria-pressed="false">
        <span class="theme-toggle-track">
          <span class="theme-toggle-thumb">
            <span class="theme-toggle-icon" aria-hidden="true">☀</span>
          </span>
        </span>
      </button>
    </div>
  `;

  initialiserThemeToggle();
});

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
