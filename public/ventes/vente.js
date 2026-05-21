const params = new URLSearchParams(window.location.search);
const venteId = params.get('id');
const roleUtilisateur = localStorage.getItem('role') || '';
const modeLectureSeule = roleUtilisateur === 'consultant';

let clientsCache = [];
let produitsCache = [];
let venteCourante = null;
let items = [];

const el = {
  titre: document.getElementById('titreVente'),
  form: document.getElementById('formVente'),
  clientId: document.getElementById('clientId'),
  dateVente: document.getElementById('dateVente'),
  modePaiement: document.getElementById('modePaiement'),
  montantPaye: document.getElementById('montantPaye'),
  taxesActivees: document.getElementById('taxesActivees'),
  factureGeneree: document.getElementById('factureGeneree'),
  envoyerFactureEmail: document.getElementById('envoyerFactureEmail'),
  emailFacture: document.getElementById('emailFacture'),
  garantieActive: document.getElementById('garantieActive'),
  garantieJours: document.getElementById('garantieJours'),
  noteGarantie: document.getElementById('noteGarantie'),
  rabais: document.getElementById('rabais'),
  notes: document.getElementById('notes'),
  tbody: document.querySelector('#itemsTable tbody'),
  message: document.getElementById('messageVente'),
  etatFacture: document.getElementById('etatFacture'),
  statutPaiement: document.getElementById('statutPaiementPreview'),
  btnSave: document.getElementById('btnEnregistrerVente'),
  btnPdf: document.getElementById('btnTelechargerFacture'),
  btnEmail: document.getElementById('btnEnvoyerFacture')
};

document.addEventListener('DOMContentLoaded', async () => {
  el.dateVente.value = new Date().toISOString().slice(0, 10);
  await Promise.all([chargerClients(), chargerProduits()]);

  if (venteId) await chargerVente();
  if (!venteId) ajouterLigne('produit');

  document.getElementById('btnAjouterTelephone').addEventListener('click', () => ajouterLigne('produit'));
  document.getElementById('btnAjouterAccessoire').addEventListener('click', () => ajouterLigne('accessoire'));
  document.getElementById('btnAjouterManuel').addEventListener('click', () => ajouterLigne('manuel'));
  el.form.addEventListener('input', recalculer);
  el.form.addEventListener('change', () => {
    synchroniserFactureEmail();
    recalculer();
  });
  el.form.addEventListener('submit', enregistrerVente);
  el.btnPdf.addEventListener('click', telechargerFacture);
  el.btnEmail.addEventListener('click', envoyerFacture);
  el.clientId.addEventListener('change', remplirEmailClient);

  appliquerModeLectureSeule();
  synchroniserFactureEmail();
  afficherItems();
  recalculer();
});

async function chargerClients() {
  const res = await fetch('/api/clients');
  clientsCache = res.ok ? await res.json() : [];
  clientsCache.forEach(client => {
    const option = document.createElement('option');
    option.value = client._id;
    option.dataset.email = client.email || '';
    option.textContent = [client.prenom, client.nom].filter(Boolean).join(' ') || client.email || client.telephone;
    el.clientId.appendChild(option);
  });
}

async function chargerProduits() {
  const res = await fetch('/api/produits');
  produitsCache = res.ok ? await res.json() : [];
}

async function chargerVente() {
  const res = await fetch(`/api/sales/${venteId}`);
  const vente = await res.json();
  if (!res.ok) throw new Error(vente.erreur || 'Vente introuvable');
  venteCourante = vente;

  el.titre.textContent = `Vente ${formatNumero(vente.numeroVente)}`;
  el.clientId.value = vente.client && vente.client._id || '';
  el.dateVente.value = vente.dateVente ? new Date(vente.dateVente).toISOString().slice(0, 10) : '';
  el.modePaiement.value = vente.modePaiement || 'comptant';
  el.montantPaye.value = vente.montantPaye || 0;
  el.taxesActivees.checked = Boolean(vente.taxesActivees);
  el.factureGeneree.checked = Boolean(vente.factureGeneree);
  el.envoyerFactureEmail.checked = Boolean(vente.envoyerFactureEmail);
  el.emailFacture.value = vente.emailFacture || vente.client && vente.client.email || '';
  el.garantieActive.checked = Boolean(vente.garantieActive);
  el.garantieJours.value = vente.garantieJours || 30;
  el.noteGarantie.value = vente.noteGarantie || '';
  el.rabais.value = vente.rabais || 0;
  el.notes.value = vente.notes || '';
  items = (vente.items || []).map(item => ({
    id: item._id,
    type: item.type,
    productId: item.productId && item.productId._id || item.productId || '',
    description: item.description || '',
    quantite: item.quantite || 1,
    prixUnitaire: item.prixUnitaire || 0,
    coutUnitaire: item.coutUnitaire || 0
  }));

  el.etatFacture.textContent = vente.factureGeneree
    ? `Facture ${formatNumero(vente.factureNumero)}${vente.factureEnvoyee ? ' envoyée' : ' générée'}`
    : 'Facture non générée.';
  el.btnPdf.style.display = vente.factureGeneree ? 'inline-flex' : 'none';
  el.btnEmail.style.display = vente.factureGeneree ? 'inline-flex' : 'none';
}

function ajouterLigne(type) {
  items.push({
    type,
    productId: '',
    description: type === 'accessoire' ? 'Accessoire' : '',
    quantite: 1,
    prixUnitaire: 0,
    coutUnitaire: 0
  });
  afficherItems();
}

function afficherItems() {
  el.tbody.innerHTML = '';

  if (!items.length) {
    el.tbody.innerHTML = '<tr><td colspan="8">Aucun article.</td></tr>';
    return;
  }

  items.forEach((item, index) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>
        <select data-index="${index}" data-field="type">
          <option value="produit" ${item.type === 'produit' ? 'selected' : ''}>Téléphone</option>
          <option value="accessoire" ${item.type === 'accessoire' ? 'selected' : ''}>Accessoire</option>
          <option value="manuel" ${item.type === 'manuel' ? 'selected' : ''}>Manuel</option>
        </select>
      </td>
      <td>${item.type === 'produit' ? selectProduit(index, item) : `<input type="text" data-index="${index}" data-field="description" value="${echapperAttr(item.description)}">`}</td>
      <td><input type="number" min="0" step="1" data-index="${index}" data-field="quantite" value="${item.quantite}"></td>
      <td><input type="text" inputmode="decimal" data-index="${index}" data-field="prixUnitaire" value="${formatNombreInput(item.prixUnitaire)}"></td>
      <td><input type="text" inputmode="decimal" data-index="${index}" data-field="coutUnitaire" value="${formatNombreInput(item.coutUnitaire)}"></td>
      <td><span data-line-total="${index}">${formatMontant(ligneTotal(item))}</span></td>
      <td><span data-line-profit="${index}">${formatMontant(ligneProfit(item))}</span></td>
      <td><button type="button" data-remove="${index}" ${modeLectureSeule ? 'disabled' : ''}>Retirer</button></td>
    `;
    el.tbody.appendChild(tr);
  });

  el.tbody.querySelectorAll('[data-index]').forEach(input => {
    input.addEventListener('change', modifierItemDepuisInput);
    input.addEventListener('input', modifierItemDepuisInput);
  });
  el.tbody.querySelectorAll('[data-remove]').forEach(button => {
    button.addEventListener('click', () => {
      items.splice(Number(button.dataset.remove), 1);
      afficherItems();
      recalculer();
    });
  });

  recalculer();
}

function selectProduit(index, item) {
  const options = ['<option value="">Sélectionner un téléphone</option>'];
  produitsCache
    .filter(produit => normaliserTexte(produit.disponibilite) !== 'vendu' || produit._id === item.productId)
    .forEach(produit => {
      const label = [produit.nom, produit.model, produit.imei].filter(Boolean).join(' - ');
      options.push(`<option value="${produit._id}" data-prix="${produit.prixvente || produit.prix || 0}" data-cout="${produit.prixachat || 0}" ${produit._id === item.productId ? 'selected' : ''}>${echapperHtml(label || 'Téléphone')}</option>`);
    });
  return `<select data-index="${index}" data-field="productId">${options.join('')}</select>`;
}

function modifierItemDepuisInput(event) {
  const input = event.target;
  const index = Number(input.dataset.index);
  const field = input.dataset.field;
  const item = items[index];
  if (!item) return;

  if (field === 'type') {
    item.type = input.value;
    item.productId = '';
    item.description = item.type === 'accessoire' ? 'Accessoire' : '';
    afficherItems();
  } else if (field === 'productId') {
    item.productId = input.value;
    const option = input.selectedOptions[0];
    const produit = produitsCache.find(p => p._id === input.value);
    item.description = option ? option.textContent : '';
    item.prixUnitaire = nombre(option && option.dataset.prix || produit && produit.prixvente || 0);
    item.coutUnitaire = nombre(option && option.dataset.cout || produit && produit.prixachat || 0);
    item.quantite = 1;
    afficherItems();
  } else if (['quantite', 'prixUnitaire', 'coutUnitaire'].includes(field)) {
    item[field] = nombre(input.value);
    rafraichirLigne(index);
    recalculer();
  } else {
    item[field] = input.value;
  }
}

function rafraichirLigne(index) {
  const item = items[index];
  if (!item) return;

  const total = el.tbody.querySelector(`[data-line-total="${index}"]`);
  const profit = el.tbody.querySelector(`[data-line-profit="${index}"]`);
  if (total) total.textContent = formatMontant(ligneTotal(item));
  if (profit) profit.textContent = formatMontant(ligneProfit(item));
}

async function enregistrerVente(event) {
  event.preventDefault();
  if (modeLectureSeule) return;

  const payload = construirePayload();
  if (!payload.items.length) {
    alert('Ajoutez au moins un article.');
    return;
  }
  if (payload.envoyerFactureEmail && !payload.emailFacture) {
    alert('Courriel requis pour envoyer la facture.');
    return;
  }

  el.btnSave.disabled = true;
  el.btnSave.textContent = 'Enregistrement...';
  try {
    const res = await fetch(venteId ? `/api/sales/${venteId}` : '/api/sales', {
      method: venteId ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.erreur || 'Erreur vente');

    const vente = data.vente || data;
    alert(data.message || 'Vente enregistrée.');
    window.location.href = `/ventes/vente.html?id=${vente._id}`;
  } catch (err) {
    alert(err.message || 'Erreur vente');
  } finally {
    el.btnSave.disabled = false;
    el.btnSave.textContent = 'Enregistrer la vente';
  }
}

function construirePayload() {
  return {
    clientId: el.clientId.value || null,
    dateVente: el.dateVente.value,
    modePaiement: el.modePaiement.value,
    montantPaye: el.montantPaye.value,
    taxesActivees: el.taxesActivees.checked,
    factureGeneree: el.factureGeneree.checked,
    envoyerFactureEmail: el.envoyerFactureEmail.checked,
    emailFacture: el.emailFacture.value,
    garantieActive: el.garantieActive.checked,
    garantieJours: el.garantieJours.value,
    noteGarantie: el.noteGarantie.value,
    rabais: el.rabais.value,
    notes: el.notes.value,
    items: items
      .filter(item => item.type === 'produit' ? item.productId : item.description)
      .map(item => ({
        type: item.type,
        productId: item.productId || undefined,
        description: item.description,
        quantite: item.quantite,
        prixUnitaire: item.prixUnitaire,
        coutUnitaire: item.coutUnitaire
      }))
  };
}

function remplirEmailClient() {
  if (el.clientId.value === '__new__') {
    window.location.href = '/client/client.html';
    return;
  }

  const option = el.clientId.selectedOptions[0];
  if (option && option.dataset.email && !el.emailFacture.value) {
    el.emailFacture.value = option.dataset.email;
  }
}

function synchroniserFactureEmail() {
  if (el.envoyerFactureEmail.checked) el.factureGeneree.checked = true;
  if (!el.factureGeneree.checked) el.envoyerFactureEmail.checked = false;
  el.envoyerFactureEmail.disabled = !el.factureGeneree.checked;
}

function recalculer() {
  const sousTotal = somme(items.map(ligneTotal));
  const rabais = Math.min(nombre(el.rabais.value), sousTotal);
  const base = Math.max(sousTotal - rabais, 0);
  const tps = el.taxesActivees.checked ? arrondir(base * 0.05) : 0;
  const tvq = el.taxesActivees.checked ? arrondir(base * 0.09975) : 0;
  const total = arrondir(base + tps + tvq);
  const cout = somme(items.map(ligneCout));
  const profit = arrondir(base - cout);
  const montantPaye = nombre(el.montantPaye.value);
  const solde = arrondir(Math.max(total - montantPaye, 0));

  document.getElementById('resumeSousTotal').textContent = formatMontant(sousTotal);
  document.getElementById('resumeTPS').textContent = formatMontant(tps);
  document.getElementById('resumeTVQ').textContent = formatMontant(tvq);
  document.getElementById('resumeTotal').textContent = formatMontant(total);
  document.getElementById('resumeCout').textContent = formatMontant(cout);
  document.getElementById('resumeProfit').textContent = formatMontant(profit);
  document.getElementById('resumeSolde').textContent = formatMontant(solde);
  el.statutPaiement.textContent = montantPaye >= total && total > 0
    ? 'Payé'
    : montantPaye > 0
      ? 'Partiellement payé'
      : 'Non payé';
}

async function telechargerFacture() {
  let res = await fetch(`/api/sales/${venteId}/invoice`);
  if (res.status === 404) {
    const generation = await fetch(`/api/sales/${venteId}/generate-invoice`, { method: 'POST' });
    if (generation.ok) res = await fetch(`/api/sales/${venteId}/invoice`);
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    alert(data.erreur || 'Erreur PDF');
    return;
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `facture_vente_${venteId}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function envoyerFacture() {
  const email = prompt('Courriel destinataire', el.emailFacture.value || '');
  if (!email) return;
  const res = await fetch(`/api/sales/${venteId}/send-invoice`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ emailFacture: email })
  });
  const data = await res.json().catch(() => ({}));
  alert(data.message || data.erreur || 'Terminé');
  location.reload();
}

function appliquerModeLectureSeule() {
  if (!modeLectureSeule) return;
  el.btnSave.style.display = 'none';
  document.querySelectorAll('#formVente input, #formVente select, #formVente textarea, #formVente button')
    .forEach(champ => {
      if (champ.id !== 'btnTelechargerFacture') champ.disabled = true;
    });
}

function ligneTotal(item) {
  return arrondir(nombre(item.quantite) * nombre(item.prixUnitaire));
}

function ligneCout(item) {
  return arrondir(nombre(item.quantite) * nombre(item.coutUnitaire));
}

function ligneProfit(item) {
  return arrondir(ligneTotal(item) - ligneCout(item));
}

function somme(valeurs) {
  return arrondir(valeurs.reduce((total, valeur) => total + nombre(valeur), 0));
}

function nombre(valeur) {
  const n = Number.parseFloat(String(valeur ?? '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

function arrondir(valeur) {
  return Math.round((nombre(valeur) + Number.EPSILON) * 100) / 100;
}

function formatMontant(valeur) {
  return `${nombre(valeur).toFixed(2)} $`;
}

function formatNumero(numero) {
  return numero ? `#${String(numero).padStart(4, '0')}` : '';
}

function formatNombreInput(valeur) {
  const nombreValeur = nombre(valeur);
  return Number.isInteger(nombreValeur) ? String(nombreValeur) : String(nombreValeur);
}

function normaliserTexte(valeur) {
  return (valeur || '').toString().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
}

function echapperHtml(valeur) {
  return (valeur || '').toString().replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function echapperAttr(valeur) {
  return echapperHtml(valeur).replace(/`/g, '&#96;');
}
