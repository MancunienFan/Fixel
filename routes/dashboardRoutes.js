const express = require('express');
const router = express.Router();

const Produit = require('../models/produitModel');
const Reparation = require('../models/reparationModel');
const Facture = require('../models/Facture');
const Sale = require('../models/Sale');
const { SavReturn, normaliserStatutSav } = require('../models/savReturnModel');
const { requireRole } = require('../middleware/permissions');
const {
  STATUTS_REPARATION_ACTIFS,
  normaliserStatutReparation,
  champDatePourStatut,
  libelleStatutReparation,
  calculerSlaReparation
} = require('../utils/reparationWorkflow');

const STATUTS_SAV_FERMES = ['resolu', 'refuse', 'non couvert par garantie', 'ferme'];

router.get('/stats', requireRole('admin'), async (req, res) => {
  try {
    const periode = lirePeriode(req.query);
    const { debutPeriode, finPeriode } = periode;

    const [produits, reparations, factures, ventes, dernieresFactures, reparationsActives, retoursSav, retoursSavMois, modelesSav] = await Promise.all([
      Produit.find({ type: 'stock' }).lean(),
      Reparation.find()
        .populate('produit', 'type')
        .lean(),
      Facture.find().lean(),
      Sale.find({
        statut: { $ne: 'annulee' },
        statutVente: { $ne: 'annulee' },
        deletedAt: null,
        annuleeLe: null
      }).lean(),
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
        .lean(),
      SavReturn.find().select('status realCost returnDate resolutionDate closedAt createdAt updatedAt productId').lean(),
      SavReturn.find({ returnDate: { $gte: debutPeriode, $lt: finPeriode } })
        .select('status realCost returnDate resolutionDate closedAt createdAt updatedAt productId')
        .lean(),
      SavReturn.aggregate([
        {
          $lookup: {
            from: 'produits',
            localField: 'productId',
            foreignField: '_id',
            as: 'produit'
          }
        },
        { $unwind: { path: '$produit', preserveNullAndEmptyArrays: true } },
        {
          $group: {
            _id: { $ifNull: ['$produit.model', '$produit.nom'] },
            total: { $sum: 1 }
          }
        },
        { $match: { _id: { $ne: null } } },
        { $sort: { total: -1 } },
        { $limit: 5 }
      ])
    ]);

    const produitsVendusLegacy = produits
      .filter(produit => normaliserTexte(produit.disponibilite) === 'vendu')
      .filter(produit => !produit.venteId)
      .map(produit => ({
        ...produit,
        dateVenteDashboard: dateReferenceVenteProduit(produit)
      }));
    const nombreProduitsVendus = produits.filter(produit => normaliserTexte(produit.disponibilite) === 'vendu').length;
    const ventesMois = ventes.filter(vente => estDansPeriode(vente.dateVente, debutPeriode, finPeriode));
    const produitsVendusLegacyMois = produitsVendusLegacy.filter(produit => estDansPeriode(produit.dateVenteDashboard, debutPeriode, finPeriode));
    const produitsVendusMois = compterProduitsVendusDansVentes(ventesMois) + produitsVendusLegacyMois.length;
    const stockPeriode = calculerStockPeriode(produits, ventesMois, produitsVendusLegacyMois, debutPeriode, finPeriode);

    const facturesPayees = factures.filter(facture => facture.statut === 'payee');
    const facturesImpayees = factures.filter(facture => ['emise', 'envoyee'].includes(facture.statut));
    const facturesImpayeesMois = facturesImpayees.filter(facture => estDansPeriode(dateReferenceFacture(facture), debutPeriode, finPeriode));
    const facturesPeriode = factures.filter(facture => estDansPeriode(dateReferencePeriodeFacture(facture), debutPeriode, finPeriode));
    const facturesPayeesPeriode = facturesPeriode.filter(facture => facture.statut === 'payee');
    const factureParReparation = indexerFacturesParReparation(factures);
    const reparationsAvecRevenu = reparations
      .map(reparation => ajouterRevenuReparation(reparation, factureParReparation))
      .filter(reparation => reparation.dateRevenu);
    const reparationsAvecRevenuMois = reparationsAvecRevenu.filter(reparation => (
      estDansPeriode(reparation.dateRevenu, debutPeriode, finPeriode)
    ));
    const reparationsTermineesMois = reparationsAvecRevenuMois.filter(reparation => reparation.estComptabilisable);

    const chiffreAffairesVentes = somme(ventes.map(chiffreAffairesVente)) + somme(produitsVendusLegacy.map(produit => produit.prixvente));
    const profitVentes = somme(ventes.map(vente => vente.profitTotal)) + somme(produitsVendusLegacy.map(produit => calculerProfitProduit(produit)));
    const chiffreAffairesVentesMois = somme(ventesMois.map(chiffreAffairesVente)) + somme(produitsVendusLegacyMois.map(produit => produit.prixvente));
    const profitVentesMois = somme(ventesMois.map(vente => vente.profitTotal)) + somme(produitsVendusLegacyMois.map(produit => calculerProfitProduit(produit)));
    const chiffreAffairesReparations = somme(reparationsAvecRevenu.map(reparation => reparation.revenu));
    const profitReparations = somme(reparationsAvecRevenu.map(reparation => reparation.profit));
    const chiffreAffairesReparationsMois = somme(reparationsTermineesMois.map(reparation => reparation.revenu));
    const profitReparationsMois = somme(reparationsTermineesMois.map(reparation => reparation.profit));
    const coutSav = somme(retoursSav.map(retour => retour.realCost));
    const coutSavMois = somme(retoursSavMois.map(retour => retour.realCost));
    const chiffreAffaires = chiffreAffairesVentes + chiffreAffairesReparations;
    const profitTotal = profitVentes + profitReparations;
    const chiffreAffairesMois = chiffreAffairesVentesMois + chiffreAffairesReparationsMois;
    const profitMois = profitVentesMois + profitReparationsMois;

    const ventesParMois = calculerVentesParMois(ventes, produitsVendusLegacy, periode.dateReference);
    const reparationsProfitParMois = calculerReparationsParMois(reparationsAvecRevenu, periode.dateReference);
    const repartitionsReparations = compterReparationsParStatut(reparations);
    const repartitionsReparationsMois = compterReparationsParStatut(
      reparations.filter(reparation => estDansPeriode(dateReferenceStatutReparation(reparation), debutPeriode, finPeriode))
    );
    const reparationsPeriode = reparations.filter(reparation => reparationDansPeriode(reparation, debutPeriode, finPeriode));
    const repartitionsReparationsPeriode = compterReparationsParStatut(reparationsPeriode);
    const reparationsActivesNormalisees = reparationsActives.filter(reparation => (
      STATUTS_REPARATION_ACTIFS.includes(normaliserStatutReparation(reparation.statut))
    ));
    const reparationsActivesAvecSla = reparationsActivesNormalisees.map(reparation => ajouterSlaReparation(reparation));
    const alertesSla = construireAlertesSla(reparationsActivesAvecSla);

    const totalPaye = somme(facturesPayees.map(totalFacture));
    const totalImpaye = somme(facturesImpayees.map(totalFacture));
    const totalImpayeMois = somme(facturesImpayeesMois.map(totalFacture));

    res.json({
      periode: {
        type: periode.type,
        mois: periode.mois,
        annee: periode.annee,
        cle: periode.cle,
        label: periode.label
      },
      produits: {
        total: produits.length,
        disponibles: stockPeriode.disponibles,
        vendus: nombreProduitsVendus,
        vendusMois: produitsVendusMois,
        pourPieces: stockPeriode.pourPieces,
        sansImei: stockPeriode.produitsAjoutesPeriode.filter(produit => !produit.imei).length,
        sansPrixVente: stockPeriode.produitsAjoutesPeriode.filter(produit => !Number(produit.prixvente)).length,
        ventesPieces: stockPeriode.ventesPieces,
        totalVentesPieces: stockPeriode.totalVentesPieces,
        totalVentesNormales: stockPeriode.totalVentesNormales
      },
      reparations: {
        recues: repartitionsReparations.recu || 0,
        diagnostic: repartitionsReparations.diagnostic || 0,
        attentePiece: repartitionsReparations['en attente piece'] || 0,
        enReparation: repartitionsReparations['en reparation'] || 0,
        pretes: repartitionsReparations.pret || 0,
        livrees: repartitionsReparations.livre || 0,
        annulees: repartitionsReparations.annule || 0,
        aFaireMois: repartitionsReparationsMois.recu || 0,
        enAttenteMois: Number(repartitionsReparationsMois.diagnostic || 0) + Number(repartitionsReparationsMois['en attente piece'] || 0),
        enCoursMois: repartitionsReparationsMois['en reparation'] || 0,
        termineesMois: reparationsTermineesMois.length,
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
        impayeesMois: facturesImpayeesMois.length,
        totalImpaye,
        totalImpayeMois,
        totalPaye,
        dernieres: dernieresFactures
      },
      sav: {
        retoursMois: retoursSavMois.length,
        ouverts: retoursSav.filter(retour => !STATUTS_SAV_FERMES.includes(normaliserStatutSav(retour.status))).length,
        resolus: retoursSav.filter(retour => normaliserStatutSav(retour.status) === 'resolu').length,
        refuses: retoursSav.filter(retour => normaliserStatutSav(retour.status) === 'refuse').length,
        coutTotal: coutSav,
        coutTotalMois: coutSavMois,
        modelesPlusRetournes: modelesSav.map(item => ({
          modele: item._id,
          total: item.total
        }))
      },
      finance: {
        chiffreAffaires,
        chiffreAffairesVentesMois,
        chiffreAffairesReparationsMois,
        chiffreAffairesMois,
        profitVentesMois,
        profitReparationsMois,
        coutSavMois,
        profitMois,
        profitTotal
      },
      graphiques: {
        ventesParMois,
        reparationsProfitParMois,
        reparationsParStatut: Object.entries(repartitionsReparationsPeriode).map(([statut, valeur]) => ({
          label: libelleStatutReparation(statut),
          valeur
        })),
        facturesParStatut: [
          { label: 'Emises', valeur: facturesPeriode.filter(facture => facture.statut === 'emise').length },
          { label: 'Envoyees', valeur: facturesPeriode.filter(facture => facture.statut === 'envoyee').length },
          { label: 'Payees', valeur: facturesPayeesPeriode.length },
          { label: 'Annulees', valeur: facturesPeriode.filter(facture => facture.statut === 'annulee').length }
        ],
        stockParStatut: [
          { label: 'Disponible', valeur: stockPeriode.disponibles },
          { label: 'Vendu', valeur: stockPeriode.vendus },
          { label: 'Pour pieces', valeur: stockPeriode.pourPieces }
        ]
      }
    });
  } catch (err) {
    console.error('Erreur dashboard :', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.get('/taxes', requireRole('admin'), async (req, res) => {
  try {
    const periode = lirePeriode(req.query);
    const { debutPeriode, finPeriode } = periode;
    const [ventes, factures] = await Promise.all([
      Sale.find({
        statut: { $ne: 'annulee' },
        statutVente: { $ne: 'annulee' },
        deletedAt: null,
        annuleeLe: null,
        dateVente: { $gte: debutPeriode, $lt: finPeriode }
      }).lean(),
      Facture.find({
        statut: { $ne: 'annulee' },
        type: { $ne: 'vente' },
        date: { $gte: debutPeriode, $lt: finPeriode }
      }).lean()
    ]);

    const ventesTaxables = ventes.filter(item => item.taxesActivees);
    const facturesTaxables = factures.filter(item => item.inclureTaxes || item.taxesActivees || item.tps || item.tvq);
    const totalVentes = somme(ventes.map(item => item.total));
    const totalFactures = somme(factures.map(totalFacture));

    res.json({
      periode: {
        type: periode.type,
        mois: periode.mois,
        annee: periode.annee,
        label: periode.label
      },
      ventes: {
        nombre: ventes.length,
        taxables: ventesTaxables.length,
        sousTotalTaxable: somme(ventesTaxables.map(item => item.sousTotalApresRabais || item.sousTotal)),
        tps: somme(ventes.map(item => item.montantTPS)),
        tvq: somme(ventes.map(item => item.montantTVQ)),
        totalTaxes: somme(ventes.map(item => item.totalTaxes)),
        total: totalVentes
      },
      factures: {
        nombre: factures.length,
        taxables: facturesTaxables.length,
        sousTotalTaxable: somme(facturesTaxables.map(item => item.totalHT)),
        tps: somme(factures.map(item => item.tps || item.montantTPS)),
        tvq: somme(factures.map(item => item.tvq || item.montantTVQ)),
        totalTaxes: somme(factures.map(item => montant(item.tps || item.montantTPS) + montant(item.tvq || item.montantTVQ))),
        total: totalFactures
      },
      total: {
        tps: somme(ventes.map(item => item.montantTPS)) + somme(factures.map(item => item.tps || item.montantTPS)),
        tvq: somme(ventes.map(item => item.montantTVQ)) + somme(factures.map(item => item.tvq || item.montantTVQ)),
        taxes: somme(ventes.map(item => item.totalTaxes))
          + somme(factures.map(item => montant(item.tps || item.montantTPS) + montant(item.tvq || item.montantTVQ))),
        revenus: totalVentes + totalFactures
      }
    });
  } catch (err) {
    console.error('Erreur rapport taxes :', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

function somme(valeurs) {
  return valeurs.reduce((total, valeur) => total + montant(valeur), 0);
}

function totalFacture(facture) {
  return montant(facture.totalTTC || facture.totalHT);
}

function montant(valeur) {
  const nombre = Number.parseFloat(valeur);
  return Number.isFinite(nombre) ? nombre : 0;
}

function lirePeriode(query) {
  const maintenant = new Date();
  const type = ['mois', 'annee', 'global'].includes(query.periode) ? query.periode : 'mois';
  const mois = entierDansIntervalle(query.mois, 1, 12) || maintenant.getMonth() + 1;
  const annee = entierDansIntervalle(query.annee, 2000, 2100) || maintenant.getFullYear();
  const dateReference = new Date(annee, mois - 1, 1);
  const debutPeriode = type === 'global'
    ? new Date(0)
    : type === 'annee'
      ? new Date(annee, 0, 1, 0, 0, 0, 0)
      : new Date(annee, mois - 1, 1, 0, 0, 0, 0);
  const finPeriode = type === 'global'
    ? new Date(8640000000000000)
    : type === 'annee'
      ? new Date(annee + 1, 0, 1, 0, 0, 0, 0)
      : new Date(annee, mois, 1, 0, 0, 0, 0);

  return {
    type,
    mois,
    annee,
    dateReference,
    debutPeriode,
    finPeriode,
    cle: type === 'global' ? 'global' : type === 'annee' ? String(annee) : cleMois(dateReference),
    label: type === 'global'
      ? 'Global'
      : type === 'annee'
      ? String(annee)
      : dateReference.toLocaleDateString('fr-CA', { month: 'long', year: 'numeric' })
  };
}

function entierDansIntervalle(valeur, min, max) {
  const nombre = Number.parseInt(valeur, 10);
  if (!Number.isInteger(nombre) || nombre < min || nombre > max) return null;
  return nombre;
}

function estDansPeriode(valeur, debut, fin) {
  if (!valeur) return false;
  const date = new Date(valeur);
  return !Number.isNaN(date.getTime()) && date >= debut && date < fin;
}

function cleMois(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function calculerVentesParMois(ventes, produitsVendusLegacy, dateReference = new Date()) {
  const mois = [];

  for (let index = 5; index >= 0; index -= 1) {
    const date = new Date(dateReference.getFullYear(), dateReference.getMonth() - index, 1);
    mois.push({
      cle: cleMois(date),
      label: date.toLocaleDateString('fr-CA', { month: 'short', year: 'numeric' }),
      chiffreAffaires: 0,
      profit: 0,
      nombre: 0
    });
  }

  ventes.forEach(vente => {
    const dateVente = new Date(vente.dateVente);
    if (Number.isNaN(dateVente.getTime())) return;

    const moisTrouve = mois.find(item => item.cle === cleMois(dateVente));
    if (!moisTrouve) return;

    lignesProduitsVente(vente).forEach(item => {
      moisTrouve.chiffreAffaires += montant(item.totalLigne);
      moisTrouve.profit += montant(item.profitLigne);
      moisTrouve.nombre += montant(item.quantite) || 1;
    });
  });

  produitsVendusLegacy.forEach(produit => {
    const dateReferenceVente = produit.dateVenteDashboard || dateReferenceVenteProduit(produit);
    if (!dateReferenceVente) return;

    const dateVente = new Date(dateReferenceVente);
    if (Number.isNaN(dateVente.getTime())) return;

    const cle = cleMois(dateVente);
    const moisTrouve = mois.find(item => item.cle === cle);
    if (!moisTrouve) return;

    moisTrouve.chiffreAffaires += montant(produit.prixvente);
    moisTrouve.profit += calculerProfitProduit(produit);
    moisTrouve.nombre += 1;
  });

  return mois;
}

function compterProduitsVendusDansVentes(ventes) {
  return ventes.reduce((total, vente) => total + lignesProduitsVente(vente).reduce((sousTotal, item) => (
    sousTotal + (montant(item.quantite) || 1)
  ), 0), 0);
}

function calculerStockPeriode(produits, ventesPeriode, produitsVendusLegacyPeriode, debut, fin) {
  const produitsExistantsFinPeriode = produits.filter(produit => produitExisteAvantFinPeriode(produit, fin));
  const produitsDisponiblesFinPeriode = produitsExistantsFinPeriode.filter(produit => (
    normaliserTexte(produit.disponibilite) === 'disponible'
    && !produitVenduAvantFinPeriode(produit, fin)
  ));
  const produitsPourPiecesFinPeriode = produitsExistantsFinPeriode.filter(produit => (
    normaliserTexte(produit.disponibilite).includes('piece')
  ));
  const ventesProduits = compterProduitsVendusDansVentes(ventesPeriode) + produitsVendusLegacyPeriode.length;
  const lignesPieces = lignesPiecesVentes(ventesPeriode);
  const lignesNormales = lignesProduitsVentes(ventesPeriode);

  return {
    produitsAjoutesPeriode: produitsExistantsFinPeriode,
    disponibles: produitsDisponiblesFinPeriode.length,
    vendus: ventesProduits,
    pourPieces: produitsPourPiecesFinPeriode.length,
    ventesPieces: somme(lignesPieces.map(item => montant(item.quantite) || 1)),
    totalVentesPieces: somme(lignesPieces.map(totalLigneVente)),
    totalVentesNormales: somme(lignesNormales.map(totalLigneVente)) + somme(produitsVendusLegacyPeriode.map(produit => produit.prixvente))
  };
}

function produitExisteAvantFinPeriode(produit, fin) {
  const dateAjout = dateReferenceAjoutProduit(produit);
  return Boolean(dateAjout && new Date(dateAjout) < fin);
}

function produitVenduAvantFinPeriode(produit, fin) {
  const dateVente = dateReferenceVenteProduit(produit);
  return Boolean(dateVente && new Date(dateVente) < fin && normaliserTexte(produit.disponibilite) === 'vendu');
}

function lignesProduitsVente(vente) {
  return Array.isArray(vente.items)
    ? vente.items.filter(item => item.type === 'produit')
    : [];
}

function lignesPiecesVentes(ventes) {
  return ventes.flatMap(vente => Array.isArray(vente.items)
    ? vente.items.filter(item => item.type === 'accessoire')
    : []);
}

function lignesProduitsVentes(ventes) {
  return ventes.flatMap(lignesProduitsVente);
}

function totalLigneVente(item) {
  if (item.totalLigne !== undefined) return item.totalLigne;
  return montant(item.quantite || 1) * montant(item.prixUnitaire);
}

function chiffreAffairesVente(vente) {
  return vente.sousTotalApresRabais !== undefined
    ? vente.sousTotalApresRabais
    : montant(vente.sousTotal) - montant(vente.rabais);
}

function calculerReparationsParMois(reparations, dateReference = new Date()) {
  const mois = [];

  for (let index = 5; index >= 0; index -= 1) {
    const date = new Date(dateReference.getFullYear(), dateReference.getMonth() - index, 1);
    mois.push({
      cle: cleMois(date),
      label: date.toLocaleDateString('fr-CA', { month: 'short', year: 'numeric' }),
      chiffreAffaires: 0,
      profit: 0,
      nombre: 0
    });
  }

  reparations
    .filter(reparation => reparation.estComptabilisable)
    .forEach(reparation => {
      const dateRevenu = new Date(reparation.dateRevenu);
      if (Number.isNaN(dateRevenu.getTime())) return;

      const moisTrouve = mois.find(item => item.cle === cleMois(dateRevenu));
      if (!moisTrouve) return;

      moisTrouve.chiffreAffaires += montant(reparation.revenu);
      moisTrouve.profit += montant(reparation.profit);
      moisTrouve.nombre += 1;
    });

  return mois;
}

function calculerProfitProduit(produit) {
  return montant(produit.prixvente) - montant(produit.prixachat);
}

function indexerFacturesParReparation(factures) {
  return factures.reduce((index, facture) => {
    if (facture.statut === 'annulee' || !Array.isArray(facture.reparations)) return index;

    facture.reparations.forEach(reparationId => {
      const cle = String(reparationId);
      const dateFacture = dateReferenceFacture(facture);
      if (!dateFacture) return;

      const factureExistante = index.get(cle);
      if (!factureExistante || new Date(dateFacture) > new Date(factureExistante.date)) {
        index.set(cle, {
          date: dateFacture,
          statut: facture.statut
        });
      }
    });

    return index;
  }, new Map());
}

function ajouterRevenuReparation(reparation, factureParReparation) {
  const statut = normaliserStatutReparation(reparation.statut);
  const facture = factureParReparation.get(String(reparation._id));
  const dateRevenu = dateReferenceRevenuReparation(reparation, facture);
  const estComptabilisable = Boolean(
    facture
    || statut === 'livre'
    || statut === 'pret'
  );
  const estProduitClient = reparation.produit && reparation.produit.type === 'client';
  const revenu = estComptabilisable && estProduitClient ? montant(reparation.prix) : 0;
  const cout = calculerCoutReparation(reparation);

  return {
    ...reparation,
    statut,
    dateRevenu,
    estComptabilisable,
    estProduitClient,
    revenu,
    profit: revenu - cout
  };
}

function calculerCoutReparation(reparation) {
  const couts = [
    reparation.coutPiece,
    reparation.coutPieces,
    reparation.coutPiecesTotal,
    reparation.coutTotal,
    reparation.cout
  ];

  return somme(couts);
}

function dateReferenceRevenuReparation(reparation, facture) {
  const candidats = [
    reparation.dateLivraison,
    facture && facture.date,
    reparation.datePret,
    derniereDateHistoriqueReparation(reparation, ['livre', 'pret']),
    reparation.date
  ].filter(Boolean);

  return premiereDateValide(candidats);
}

function dateReferenceVenteProduit(produit) {
  return premiereDateValide([
    produit.datevente,
    produit.soldAt,
    produit.dateVente,
    produit.venduLe
  ]);
}

function dateReferenceAjoutProduit(produit) {
  return premiereDateValide([
    produit.dateachat,
    produit.dateCreation,
    produit.createdAt
  ]);
}

function dateReferenceSav(retour) {
  return premiereDateValide([
    retour.returnDate,
    retour.resolutionDate,
    retour.closedAt,
    retour.updatedAt,
    retour.createdAt
  ]);
}

function dateReferenceFacture(facture) {
  return premiereDateValide([facture.datePaiement, facture.dateEmission, facture.date]);
}

function dateReferencePeriodeFacture(facture) {
  return premiereDateValide([facture.date, facture.dateEmission, facture.createdAt]);
}

function dateReferenceStatutReparation(reparation) {
  const statut = normaliserStatutReparation(reparation.statut);
  return premiereDateValide([
    champDatePourStatut(statut) && reparation[champDatePourStatut(statut)],
    derniereDateHistoriqueReparation(reparation, [statut]),
    reparation.date
  ]);
}

function dateReferenceCreationReparation(reparation) {
  return premiereDateValide([reparation.createdAt, reparation.date]);
}

function reparationDansPeriode(reparation, debut, fin) {
  const statut = normaliserStatutReparation(reparation.statut);
  const dateCreation = dateReferenceCreationReparation(reparation);

  if (STATUTS_REPARATION_ACTIFS.includes(statut)) {
    return Boolean(dateCreation && new Date(dateCreation) < fin);
  }

  return estDansPeriode(dateReferenceStatutReparation(reparation), debut, fin);
}

function derniereDateHistoriqueReparation(reparation, statuts) {
  if (!Array.isArray(reparation.historiqueStatuts)) return null;
  const statutsNormalises = statuts.map(normaliserStatutReparation);

  return reparation.historiqueStatuts
    .filter(entree => statutsNormalises.includes(normaliserStatutReparation(entree.vers)) && entree.date)
    .map(entree => new Date(entree.date))
    .filter(date => !Number.isNaN(date.getTime()))
    .sort((a, b) => b - a)[0] || null;
}

function premiereDateValide(candidats) {
  for (const candidat of candidats) {
    const date = new Date(candidat);
    if (!Number.isNaN(date.getTime())) return date;
  }

  return null;
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
