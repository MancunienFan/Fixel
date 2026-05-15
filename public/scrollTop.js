(function initialiserScrollTop() {
  window.addEventListener('DOMContentLoaded', () => {
    if (document.querySelector('.scroll-top-button')) return;

    const bouton = document.createElement('button');
    bouton.type = 'button';
    bouton.className = 'scroll-top-button';
    bouton.setAttribute('aria-label', 'Retour en haut de page');
    bouton.innerHTML = '&uarr;';

    bouton.addEventListener('click', () => {
      window.scrollTo({
        top: 0,
        behavior: 'smooth'
      });
    });

    document.body.appendChild(bouton);

    const mettreAJourVisibilite = () => {
      bouton.classList.toggle('visible', window.scrollY > 320);
    };

    mettreAJourVisibilite();
    window.addEventListener('scroll', mettreAJourVisibilite, { passive: true });
  });
})();
