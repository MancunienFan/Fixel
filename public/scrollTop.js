window.addEventListener('DOMContentLoaded', () => {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'scroll-top-button';
  button.setAttribute('aria-label', 'Remonter en haut de page');
  button.textContent = '↑';

  document.body.appendChild(button);

  const toggleVisibility = () => {
    button.classList.toggle('visible', window.scrollY > 300);
  };

  button.addEventListener('click', () => {
    window.scrollTo({
      top: 0,
      behavior: 'smooth'
    });
  });

  window.addEventListener('scroll', toggleVisibility, { passive: true });
  toggleVisibility();
});
