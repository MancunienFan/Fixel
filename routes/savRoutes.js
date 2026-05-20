const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();

const { SavReturn, STATUTS_SAV, normaliserStatutSav } = require('../models/savReturnModel');
const Client = require('../models/clientModel');
const Produit = require('../models/produitModel');
const Reparation = require('../models/reparationModel');
const Facture = require('../models/Facture');
const { requirePermission } = require('../middleware/permissions');

const STATUTS_FERMES = ['resolu', 'refuse', 'non couvert par garantie', 'ferme'];

function idInvalide(id) {
  return id && !mongoose.Types.ObjectId.isValid(id);
}

router.get('/meta', requirePermission('sav', 'read'), (req, res) => {
  res.json({
    statuts: STATUTS_SAV,
    statutsFermes: STATUTS_FERMES
  });
});

router.get('/stats', requirePermission('sav', 'read'), async (req, res) => {
  try {
    const periode = lirePeriode(req.query);
    const filtrePeriode = { returnDate: { $gte: periode.debutPeriode, $lt: periode.finPeriode } };

    const [tous, periodeRetours, topModeles] = await Promise.all([
      SavReturn.find().select('status realCost returnDate').lean(),
      SavReturn.find(filtrePeriode).select('status realCost returnDate').lean(),
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

    const ouverts = tous.filter(retour => !STATUTS_FERMES.includes(normaliserStatutSav(retour.status))).length;

    res.json({
      periode: {
        type: periode.type,
        mois: periode.mois,
        annee: periode.annee
      },
      totalMois: periodeRetours.length,
      ouverts,
      resolus: tous.filter(retour => normaliserStatutSav(retour.status) === 'resolu').length,
      refuses: tous.filter(retour => normaliserStatutSav(retour.status) === 'refuse').length,
      coutTotal: somme(tous.map(retour => retour.realCost)),
      coutTotalMois: somme(periodeRetours.map(retour => retour.realCost)),
      modelesPlusRetournes: topModeles.map(item => ({
        modele: item._id,
        total: item.total
      }))
    });
  } catch (err) {
    console.error('Erreur stats SAV :', err);
    res.status(500).json({ erreur: 'Erreur serveur' });
  }
});

router.get('/', requirePermission('sav', 'read'), async (req, res) => {
  try {
    const filtre = construireFiltre(req.query);
    const retours = await SavReturn.find(filtre)
      .populate('clientId', 'nom prenom telephone email')
      .populate('productId', 'nom model imei type disponibilite')
      .populate('repairId', 'description date statut prix')
      .populate('invoiceId', 'numeroFacture date statut totalHT totalTTC')
      .sort({ returnDate: -1, savNumber: -1 })
      .lean();

    res.json(retours.map(ajouterEtatGarantie));
  } catch (err) {
    res.status(500).json({ erreur: err.message });
  }
});

router.post('/', requirePermission('sav', 'create'), async (req, res) => {
  try {
    const payload = await preparerPayloadSav(req.body);
    const retour = new SavReturn(payload);

    retour.historiqueStatuts = [{
      vers: retour.status,
      date: new Date(),
      utilisateur: req.utilisateur && req.utilisateur.id,
      role: req.utilisateur && req.utilisateur.role,
      note: 'Creation'
    }];

    await retour.save();
    await Produit.findByIdAndUpdate(retour.productId, { datemodification: new Date() });

    const retourComplet = await lireRetourComplet(retour._id);
    res.status(201).json(ajouterEtatGarantie(retourComplet));
  } catch (err) {
    res.status(err.statusCode || 400).json({ erreur: err.message });
  }
});

router.get('/:id', requirePermission('sav', 'read'), async (req, res) => {
  try {
    if (idInvalide(req.params.id)) {
      return res.status(400).json({ erreur: 'ID retour SAV invalide.' });
    }

    const retour = await lireRetourComplet(req.params.id);
    if (!retour) return res.status(404).json({ erreur: 'Retour SAV introuvable.' });

    res.json(ajouterEtatGarantie(retour));
  } catch (err) {
    res.status(500).json({ erreur: err.message });
  }
});

router.put('/:id', requirePermission('sav', 'update'), async (req, res) => {
  try {
    if (idInvalide(req.params.id)) {
      return res.status(400).json({ erreur: 'ID retour SAV invalide.' });
    }

    const retour = await SavReturn.findById(req.params.id);
    if (!retour) return res.status(404).json({ erreur: 'Retour SAV introuvable.' });

    const ancienStatut = normaliserStatutSav(retour.status);
    const updateData = await preparerPayloadSav(req.body, { partiel: true });
    delete updateData.historiqueStatuts;
    delete updateData.savNumber;

    retour.set(updateData);
    const nouveauStatut = normaliserStatutSav(retour.status);

    if (nouveauStatut && nouveauStatut !== ancienStatut) {
      retour.historiqueStatuts.push({
        de: ancienStatut,
        vers: nouveauStatut,
        date: new Date(),
        utilisateur: req.utilisateur && req.utilisateur.id,
        role: req.utilisateur && req.utilisateur.role,
        note: req.body.noteTransition || ''
      });
    }

    await retour.save();
    await Produit.findByIdAndUpdate(retour.productId, { datemodification: new Date() });

    const retourComplet = await lireRetourComplet(retour._id);
    res.json(ajouterEtatGarantie(retourComplet));
  } catch (err) {
    res.status(err.statusCode || 400).json({ erreur: err.message });
  }
});

async function lireRetourComplet(id) {
  return SavReturn.findById(id)
    .populate('clientId', 'nom prenom telephone email')
    .populate('productId', 'nom model imei type disponibilite clientId')
    .populate('repairId', 'description date statut prix')
    .populate('invoiceId', 'numeroFacture date statut totalHT totalTTC')
    .lean();
}

function construireFiltre(query) {
  const filtre = {};

  if (query.clientId && !idInvalide(query.clientId)) filtre.clientId = query.clientId;
  if (query.productId && !idInvalide(query.productId)) filtre.productId = query.productId;
  if (query.status) filtre.status = normaliserStatutSav(query.status);
  if (query.warrantyStatus) filtre.warrantyStatus = query.warrantyStatus;

  const mois = Number.parseInt(query.mois, 10);
  const annee = Number.parseInt(query.annee, 10);
  if (Number.isInteger(mois) && mois >= 1 && mois <= 12) {
    const anneeFiltre = Number.isInteger(annee) ? annee : new Date().getFullYear();
    filtre.returnDate = {
      $gte: new Date(anneeFiltre, mois - 1, 1),
      $lt: new Date(anneeFiltre, mois, 1)
    };
  } else if (Number.isInteger(annee)) {
    filtre.returnDate = {
      $gte: new Date(annee, 0, 1),
      $lt: new Date(annee + 1, 0, 1)
    };
  }

  return filtre;
}

async function preparerPayloadSav(body, options = {}) {
  const partiel = options.partiel === true;
  const payload = {};

  copierSiDefini(payload, body, [
    'returnDate',
    'returnType',
    'customerIssue',
    'detailedDescription',
    'photosNotes',
    'warrantyStatus',
    'warrantyStartDate',
    'warrantyEndDate',
    'internalDiagnosis',
    'decision',
    'estimatedCost',
    'realCost',
    'status',
    'internalNotes',
    'resolutionDate',
    'closedAt'
  ]);

  const relations = {
    clientId: body.clientId,
    productId: body.productId,
    repairId: body.repairId,
    invoiceId: body.invoiceId,
    warrantyId: body.warrantyId
  };

  Object.entries(relations).forEach(([champ, valeur]) => {
    if (valeur === '') return;
    if (valeur !== undefined) payload[champ] = valeur;
  });

  if (!partiel || payload.clientId) {
    if (!payload.clientId || idInvalide(payload.clientId)) {
      throw erreurRequete('Client requis ou invalide.');
    }
    const clientExiste = await Client.exists({ _id: payload.clientId });
    if (!clientExiste) throw erreurRequete('Client introuvable.', 404);
  }

  if (!partiel || payload.productId) {
    if (!payload.productId || idInvalide(payload.productId)) {
      throw erreurRequete('Produit requis ou invalide.');
    }
    const produit = await Produit.findById(payload.productId);
    if (!produit) throw erreurRequete('Produit introuvable.', 404);
    if (!payload.clientId && produit.clientId) payload.clientId = produit.clientId;
  }

  if (payload.repairId) {
    if (idInvalide(payload.repairId)) throw erreurRequete('Reparation invalide.');
    const reparation = await Reparation.findById(payload.repairId);
    if (!reparation) throw erreurRequete('Reparation introuvable.', 404);
    if (!payload.productId && reparation.produit) payload.productId = reparation.produit;
    if (!payload.clientId && reparation.client) payload.clientId = reparation.client;
  }

  if (payload.invoiceId) {
    if (idInvalide(payload.invoiceId)) throw erreurRequete('Facture invalide.');
    const facture = await Facture.findById(payload.invoiceId);
    if (!facture) throw erreurRequete('Facture introuvable.', 404);
    if (!payload.productId && facture.produit) payload.productId = facture.produit;
    if (!payload.clientId && facture.client) payload.clientId = facture.client;
  }

  if (payload.warrantyId && idInvalide(payload.warrantyId)) {
    throw erreurRequete('Garantie invalide.');
  }

  ['estimatedCost', 'realCost'].forEach(champ => {
    if (payload[champ] !== undefined && payload[champ] !== '') {
      payload[champ] = Number(payload[champ]);
    }
  });

  ['returnDate', 'warrantyStartDate', 'warrantyEndDate', 'resolutionDate', 'closedAt'].forEach(champ => {
    if (payload[champ] === '') payload[champ] = undefined;
  });

  if (!partiel && !payload.customerIssue) {
    throw erreurRequete('Probleme declare requis.');
  }

  return payload;
}

function ajouterEtatGarantie(retour) {
  if (!retour) return retour;

  const maintenant = new Date();
  const fin = retour.warrantyEndDate ? new Date(retour.warrantyEndDate) : null;
  let warrantyComputedStatus = 'a verifier';
  let warrantyDaysRemaining = null;

  if (retour.warrantyStatus === 'non') {
    warrantyComputedStatus = 'aucune';
  } else if (fin && !Number.isNaN(fin.getTime())) {
    const diff = fin.getTime() - maintenant.getTime();
    warrantyDaysRemaining = Math.ceil(diff / (1000 * 60 * 60 * 24));
    warrantyComputedStatus = diff >= 0 ? 'active' : 'expiree';
  } else if (retour.warrantyStatus === 'oui') {
    warrantyComputedStatus = 'active';
  }

  return {
    ...retour,
    warrantyComputedStatus,
    warrantyDaysRemaining
  };
}

function copierSiDefini(cible, source, champs) {
  champs.forEach(champ => {
    if (source[champ] !== undefined) cible[champ] = source[champ];
  });
}

function erreurRequete(message, statusCode = 400) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

function somme(valeurs) {
  return valeurs.reduce((total, valeur) => total + Number(valeur || 0), 0);
}

function lirePeriode(query) {
  const maintenant = new Date();
  const type = query.periode === 'annee' ? 'annee' : 'mois';
  const mois = entierDansIntervalle(query.mois, 1, 12) || maintenant.getMonth() + 1;
  const annee = entierDansIntervalle(query.annee, 2000, 2100) || maintenant.getFullYear();
  return {
    type,
    mois,
    annee,
    debutPeriode: type === 'annee'
      ? new Date(annee, 0, 1)
      : new Date(annee, mois - 1, 1),
    finPeriode: type === 'annee'
      ? new Date(annee + 1, 0, 1)
      : new Date(annee, mois, 1)
  };
}

function entierDansIntervalle(valeur, min, max) {
  const nombre = Number.parseInt(valeur, 10);
  return Number.isInteger(nombre) && nombre >= min && nombre <= max ? nombre : null;
}

module.exports = router;
