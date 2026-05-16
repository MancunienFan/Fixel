const express = require('express');
const router = express.Router();

const Produit = require('../models/produitModel');
const Reparation = require('../models/reparationModel');
const Facture = require('../models/Facture');
const {
  STATUTS_REPARATION_ACTIFS,
  normaliserStatutReparation,
  libelleStatutReparation,
  calculerSlaReparation
} = require('../utils/reparationWorkflow');

router.get('/stats', async (req, res) => {
  try {
    const debutMois = new Date();
    debutMois.setDate(1);
    debutMois.setHours(0, 0, 0, 0);

    const [produits, reparations, factures, dernieresFactures, reparationsActives] = await Promise.all([
      Produit.find({ type: 'stock' }).lean(),
      Reparation.find().lean(),
      Facture.find().lean(),
      Facture.find()
        .populate('client', 'nom prenom email telephone')
        .populate('produit', 'nom model imei')
        .sort({ date: -1, numeroFacture: -1 })
        .limit(6)
        .lean(),
      Reparation.find({ statut: { $nin: ['livre', 'livree', 'annule', 'annulee'] } })
        .populate({
          path: 'produit',
          select: 'nom model imei clientId',
          populate: {
            path: 'clientId',
            select: 'nom prenom telephone'
          }
        })
        .populate('client', 'nom prenom telephone')
        .sort({ date: 1 })
        .limit(8)
        .lean()
    ]);

    const produitsVendus = produits.filter(produit => normaliserTexte(produit.disponibilite) === 'vendu');
    const produitsDisponibles = produits.filter(produit => normaliserTexte(produit.disponibilite) === 'disponible');
    const produitsPourPieces = produits.filter(produit => normaliserTexte(produit.disponibilite).includes('piece'));

    const chiffreAffaires = somme(produitsVendus.map(produit => produit.prixvente));
    const profitTotal = somme(produitsVendus.map(produit => Number(produit.prixvente || 0) - Number(produit.prixachat || 0)));
    const chiffreAffairesMois = somme(
      produitsVendus
        .filter(produit => produit.datevente && new Date(produit.datevente) >= debutMois)
        .map(produit => produit.prixvente)
    );

    const facturesPayees = factures.filter(facture => facture.statut === 'payee');
    const facturesImpayees = factures.filter(facture => ['emise', 'envoyee'].includes(facture.statut));
    const ventesParMois = calculerVentesParMois(produitsVendus);
    const repartitionsReparations = compterReparationsParStatut(reparations);
    const reparationsActivesNormalisees = reparationsActives.filter(reparation => (
      STATUTS_REPARATION_ACTIFS.includes(normaliserStatutReparation(reparation.statut))
    ));
    const reparationsActivesAvecSla = reparationsActivesNormalisees.map(reparation => ajouterSlaReparation(reparation));
    const alertesSla = construireAlertesSla(reparationsActivesAvecSla);

    const totalPaye = somme(facturesPayees.map(totalFacture));
    const totalImpaye = somme(facturesImpayees.map(totalFacture));

    res.json({
      produits: {
        total: produits.length,
        disponibles: produitsDisponibles.length,
        vendus: produitsVendus.length,
        pourPieces: produitsPourPieces.length,
        sansImei: produits.filter(produit => !produit.imei).length,
        sansPrixVente: produits.filter(produit => !Number(produit.prixvente)).length
      },
      reparations: {
        recues: repartitionsReparations.recu || 0,
        diagnostic: repartitionsReparations.diagnostic || 0,
        attentePiece: repartitionsReparations['en attente piece'] || 0,
        enReparation: repartitionsReparations['en reparation'] || 0,
        pretes: repartitionsReparations.pret || 0,
        livrees: repartitionsReparations.livre || 0,
        annulees: repartitionsReparations.annule || 0,
        sla: {
          retards: alertesSla.retards,
          attentions: alertesSla.attentions,
          alertes: alertesSla.alertes
        },
        actives: reparationsActivesAvecSla
      },
      factures: {
        emises: factures.filter(facture => facture.statut === 'emise').length,
        envoyees: factures.filter(facture => facture.statut === 'envoyee').length,
        payees: facturesPayees.length,
        annulees: factures.filter(facture => facture.statut === 'annulee').length,
        totalImpaye,
        totalPaye,
        dernieres: dernieresFactures
      },
      finance: {
        chiffreAffaires,
        chiffreAffairesMois,
        profitTotal
      },
      graphiques: {
        ventesParMois,
        reparationsParStatut: Object.entries(repartitionsReparations).map(([statut, valeur]) => ({
          label: libelleStatutReparation(statut),
          valeur
        })),
        facturesParStatut: [
          { label: 'Emises', valeur: factures.filter(facture => facture.statut === 'emise').length },
          { label: 'Envoyees', valeur: factures.filter(facture => facture.statut === 'envoyee').length },
          { label: 'Payees', valeur: facturesPayees.length },
          { label: 'Annulees', valeur: factures.filter(facture => facture.statut === 'annulee').length }
        ],
        stockParStatut: [
          { label: 'Disponible', valeur: produitsDisponibles.length },
          { label: 'Vendu', valeur: produitsVendus.length },
          { label: 'Pour pieces', valeur: produitsPourPieces.length }
        ]
      }
    });
  } catch (err) {
    console.error('Erreur dashboard :', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

function somme(valeurs) {
  return valeurs.reduce((total, valeur) => total + Number(valeur || 0), 0);
}

function totalFacture(facture) {
  return Number(facture.totalTTC || facture.totalHT || 0);
}

function calculerVentesParMois(produitsVendus) {
  const maintenant = new Date();
  const mois = [];

  for (let index = 5; index >= 0; index -= 1) {
    const date = new Date(maintenant.getFullYear(), maintenant.getMonth() - index, 1);
    mois.push({
      cle: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`,
      label: date.toLocaleDateString('fr-CA', { month: 'short', year: 'numeric' }),
      chiffreAffaires: 0,
      profit: 0
    });
  }

  produitsVendus.forEach(produit => {
    if (!produit.datevente) return;

    const dateVente = new Date(produit.datevente);
    if (Number.isNaN(dateVente.getTime())) return;

    const cle = `${dateVente.getFullYear()}-${String(dateVente.getMonth() + 1).padStart(2, '0')}`;
    const moisTrouve = mois.find(item => item.cle === cle);
    if (!moisTrouve) return;

    moisTrouve.chiffreAffaires += Number(produit.prixvente || 0);
    moisTrouve.profit += Number(produit.prixvente || 0) - Number(produit.prixachat || 0);
  });

  return mois;
}

function normaliserTexte(valeur) {
  return (valeur || '')
    .toString()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function compterReparationsParStatut(reparations) {
  return reparations.reduce((total, reparation) => {
    const statut = normaliserStatutReparation(reparation.statut) || 'recu';
    total[statut] = (total[statut] || 0) + 1;
    return total;
  }, {});
}

function ajouterSlaReparation(reparation) {
  return {
    ...reparation,
    sla: calculerSlaReparation(reparation)
  };
}

function construireAlertesSla(reparations) {
  const alertes = reparations
    .filter(reparation => reparation.sla && reparation.sla.criticite !== 'ok')
    .sort((a, b) => {
      const rang = { retard: 0, attention: 1, ok: 2 };
      return (rang[a.sla.criticite] ?? 2) - (rang[b.sla.criticite] ?? 2)
        || Number(a.sla.heuresRestantes || 0) - Number(b.sla.heuresRestantes || 0);
    })
    .slice(0, 8)
    .map(reparation => ({
      id: String(reparation._id),
      produit: formatProduitAlerte(reparation.produit),
      client: formatClientAlerte(reparation.client || (reparation.produit && reparation.produit.clientId)),
      statut: reparation.sla.statut,
      criticite: reparation.sla.criticite,
      message: reparation.sla.message
    }));

  return {
    retards: reparations.filter(reparation => reparation.sla && reparation.sla.criticite === 'retard').length,
    attentions: reparations.filter(reparation => reparation.sla && reparation.sla.criticite === 'attention').length,
    alertes
  };
}

function formatProduitAlerte(produit = {}) {
  produit = produit || {};
  return [produit.nom, produit.model, produit.imei].filter(Boolean).join(' - ') || '-';
}

function formatClientAlerte(client = {}) {
  client = client || {};
  return [client.nom, client.prenom].filter(Boolean).join(' ') || '-';
}

module.exports = router;
