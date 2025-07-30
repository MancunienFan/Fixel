// Variables pour stocker les objets sélectionnés
let selectedClient = null;
let selectedProduit = null;
let selectedReparation = null;
let lastFactureId = null;

document.addEventListener('DOMContentLoaded', async () => {
  const clientSelect = document.getElementById('clientSelect');
  const produitSelect = document.getElementById('produitSelect');
  const reparationSelect = document.getElementById('reparationSelect');
  const produitContainer = document.getElementById('produitContainer');
  const reparationContainer = document.getElementById('reparationContainer');
  const detailsContainer = document.getElementById('detailsContainer');
  const detailsReparation = document.getElementById('detailsReparation');
  const genererPdfBtn = document.getElementById('genererPdfBtn');
  const tvaInput = document.getElementById('tvaInput');
  const downloadChecked = document.getElementById('telechargerCheckbox');
  const inclureTaxesCheckbox  = document.getElementById('inclureTaxesCheckbox');
  
  
  // Masquer initialement le bouton PDF
  genererPdfBtn.style.display = 'none';

  // Charger les clients
  const clients = await fetch('/api/clients').then(res => res.json());

  clients.forEach(c => {
    const option = document.createElement('option');
    option.value = c._id;
    option.textContent = `${c.nom} ${c.prenom}`;
    clientSelect.appendChild(option);
  });

  clientSelect.addEventListener('change', async () => {
    const clientId = clientSelect.value;
    selectedClient = clients.find(c => c._id === clientId);

    produitSelect.innerHTML = '<option value="">-- Sélectionnez un produit --</option>';
    reparationSelect.innerHTML = '<option value="">-- Sélectionnez une réparation --</option>';
    produitContainer.style.display = 'none';
    reparationContainer.style.display = 'none';
    detailsContainer.style.display = 'none';
    genererPdfBtn.style.display = 'none';
    selectedProduit = null;
    selectedReparation = null;

    if (clientId) {
      const produits = await fetch(`/api/produits/client/${clientId}`).then(res => res.json());
      produits.forEach(p => {
        const option = document.createElement('option');
        option.value = p._id;
        option.textContent = `${p.nom} (${p.imei || p.modele})`;
        produitSelect.appendChild(option);
      });
      produitContainer.style.display = 'block';
    }
  });

  produitSelect.addEventListener('change', async () => {
    const produitId = produitSelect.value;
    reparationSelect.innerHTML = '<option value="">-- Sélectionnez une réparation --</option>';
    reparationContainer.style.display = 'none';
    detailsContainer.style.display = 'none';
    genererPdfBtn.style.display = 'none';
    selectedReparation = null;

    if (produitId) {
      selectedProduit = await fetch(`/api/produit/${produitId}`).then(res => res.json());

      const reparations = await fetch(`/api/reparations/produit/${produitId}`).then(res => res.json());
      reparations.forEach(r => {
        const option = document.createElement('option');
        option.value = r._id;
        option.textContent = `${r.description} - ${r.statut}`;
        reparationSelect.appendChild(option);
      });
      reparationContainer.style.display = 'block';
    }
  });

  reparationSelect.addEventListener('change', async () => {
    const selectedOptions = Array.from(reparationSelect.selectedOptions);
    const reparationIds = selectedOptions.map(option => option.value).filter(id => id);
    detailsContainer.innerHTML = ''; // Réinitialise les détails
    selectedReparations = [];

    if (reparationIds.length > 0) {
      for (const id of reparationIds) {
        try {
          const reparation = await fetch(`/api/reparations/${id}`).then(res => res.json());
          selectedReparations.push(reparation);

          const detail = document.createElement('p');
          detail.textContent = `• ${reparation.description} — ${reparation.prix}$ ${reparation.notes ? '(' + reparation.notes + ')' : ''}`;
          detailsContainer.appendChild(detail);
        } catch (error) {
          console.error(`Erreur chargement réparation ${id}`, error);
        }
      }

      detailsContainer.style.display = 'block';
      genererPdfBtn.style.display = 'inline-block';
      document.getElementById('checkboxContainer').style.display = 'inline-block';
     // telechargerPdfbtn.style.display = 'inline-block';
    } else {
      selectedReparations = [];
      detailsContainer.style.display = 'none';
      genererPdfBtn.style.display = 'none';
    }
  });


  document.getElementById('genererPdfBtn').addEventListener('click', async (e) => {
    e.preventDefault();

    const clientId = document.getElementById('clientSelect').value;
    const produitId = document.getElementById('produitSelect').value;
    const selectedOptions = Array.from(document.getElementById('reparationSelect').selectedOptions);
    const reparationIds = selectedOptions.map(option => option.value).filter(id => id);

    if (!clientId || !produitId || reparationIds.length === 0) {
      alert("Veuillez sélectionner un client, un produit et au moins une réparation.");
      return;
    }

    try {
      const response = await fetch('/api/factures', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId,
          produitId,
          reparationIds,
           inclureTaxes: inclureTaxesCheckbox.checked  
        })
      });

      if (!response.ok) throw new Error("Erreur lors de la création de la facture");
  // ✅ Télécharger si la case est cochée
        const result = await response.json();

    if (downloadChecked.checked) {
      lastFactureId = result._id;
       const res = await fetch(`/api/factures/${lastFactureId}/pdf?inclureTaxes=${inclureTaxesCheckbox.checked}`);
      if (!res.ok) throw new Error("Erreur lors du téléchargement");

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `facture_${lastFactureId }.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    }

      
      alert(result.message || "Facture envoyée avec succès par courriel !");

    } catch (err) {
      console.error('Erreur PDF :', err);
      alert("Une erreur est survenue lors de l'envoi de la facture.");
    }
  });

/*
// Clic sur le bouton Télécharger la facture
document.getElementById('telechargerPdfBtn').addEventListener('click', async (e) => {
  e.preventDefault();

  if (!lastFactureId) {
    alert("Veuillez d'abord générer une facture.");
    return;
  }

  try {
    // On fait une requête GET pour récupérer le PDF (buffer)
    const response = await fetch(`/api/factures/${lastFactureId}/pdf`, {
      method: 'GET'
    });

    if (!response.ok) throw new Error("Erreur lors du téléchargement de la facture");

    // Récupérer le contenu du PDF sous forme de Blob
    const blob = await response.blob();

    // Créer un lien temporaire pour forcer le téléchargement
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;

    // Donner un nom au fichier PDF téléchargé (optionnel)
    a.download = `facture_${lastFactureId}.pdf`;

    document.body.appendChild(a);
    a.click();

    // Nettoyer le DOM et libérer l'URL temporaire
    a.remove();
    window.URL.revokeObjectURL(url);

  } catch (err) {
    console.error('Erreur téléchargement PDF :', err);
    alert("Une erreur est survenue lors du téléchargement de la facture.");
  }
});*/


});
