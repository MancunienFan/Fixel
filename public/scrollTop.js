(function initialiserScrollTop() {
  window.addEventListener('DOMContentLoaded', () => {
    if (document.querySelector('.scroll-top-button')) return;

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'scroll-top-button';
    button.setAttribute('aria-label', 'Remonter en haut de page');
    button.textContent = '↑';

    button.addEventListener('click', () => {
      window.scrollTo({
        top: 0,
        behavior: 'smooth'
      });
    });

    document.body.appendChild(button);

    const toggleVisibility = () => {
      button.classList.toggle('visible', window.scrollY > 300);
    };

    toggleVisibility();
    window.addEventListener('scroll', toggleVisibility, { passive: true });
  });
})();
