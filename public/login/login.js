 const API_BASE_URL = window.location.origin; // ou localhost

    document.getElementById('login-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('email').value;
      const motdepasse = document.getElementById('motdepasse').value;

      const res = await fetch(`${API_BASE_URL}/api/utilisateurs/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, motdepasse })
      });

      const data = await res.json();

      if (res.ok) {
        localStorage.setItem('token', data.token);
        localStorage.setItem('role', data.role);
        alert('Connexion réussie');
        window.location.href = '/index.html';
      } else {
        alert(data.erreur);
      }
    });