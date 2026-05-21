const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Reparation = require('../models/reparationModel');
const Produit = require('../models/produitModel');
const Facture = require('../models/Facture');
const {
  STATUTS_REPARATION_ACTIFS,
  normaliserStatutReparation,
  champDatePourStatut,
  transitionStatutAutorisee,
  libelleStatutReparation,
  calculerSlaReparation
} = require('../utils/reparationWorkflow');
const { requirePermission } = require('../middleware/permissions');

function idInvalide(id) {
  return !mongoose.Types.ObjectId.isValid(id);
}

router.get('/reparations/produit/:id', requirePermission('reparations', 'read'), async (req, res) => {
  try {
    if (idInvalide(req.params.id)) {
      return res.status(400).json({ erreur: 'ID produit invalide.' });
    }

    const reparations = await Reparation.find({ produit: req.params.id }).sort({ date: -1 });
    res.json(reparations);
  } catch (err) {
    res.status(500).json({ erreur: err.message });
  }
});

router.get('/reparations/atelier', requirePermission('atelier', 'read'), async (req, res) => {
  try {
    const reparations = await Reparation.find({ statut: { $nin: ['livre', 'livree', 'annule', 'annulee'] } })
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
      .lean();

    const reparationsActives = reparations.filter(reparation => (
      STATUTS_REPARATION_ACTIFS.includes(normaliserStatutReparation(reparation.statut))
    ));

    const colonnes = STATUTS_REPARATION_ACTIFS.map(statut => ({
      statut,
      libelle: libelleStatutReparation(statut),
      reparations: []
    }));

    const colonnesParStatut = new Map(colonnes.map(colonne => [colonne.statut, colonne]));

    reparationsActives.forEach(reparation => {
      const statut = normaliserStatutReparation(reparation.statut) || 'recu';
      const colonne = colonnesParStatut.get(statut);
      if (!colonne) return;

      colonne.reparations.push({
        ...reparation,
        statut,
        statutLibelle: libelleStatutReparation(statut),
        sla: calculerSlaReparation(reparation)
      });
    });

    res.json({
      colonnes,
      total: reparationsActives.length,
      sla: {
        retards: reparationsActives.filter(reparation => calculerSlaReparation(reparation).criticite === 'retard').length,
        attentions: reparationsActives.filter(reparation => calculerSlaReparation(reparation).criticite === 'attention').length
      }
    });
  } catch (err) {
    res.status(500).json({ erreur: err.message });
  }
});

router.post('/reparation', requirePermission('reparations', 'create'), async (req, res) => {
  try {
    const reparation = await creerReparationDepuisBody(req.body, req.utilisateur);
    await reparation.save();
    await Produit.findByIdAndUpdate(reparation.produit, { datemodification: new Date() });
    res.status(201).json(reparation);
  } catch (err) {
    repondreErreurCreation(res, err);
  }
});

router.get('/reparations/:id', requirePermission('reparations', 'read'), async (req, res) => {
  try {
    if (idInvalide(req.params.id)) {
      return res.status(400).json({ erreur: 'ID reparation invalide.' });
    }

    const reparation = await Reparation.findById(req.params.id);
    if (!reparation) return res.status(404).json({ erreur: 'Reparation introuvable.' });
    res.json(reparation);
  } catch (err) {
    res.status(500).json({ erreur: err.message });
  }
});

router.put('/reparations/:id', requirePermission('reparations', 'update'), async (req, res) => {
  try {
    if (idInvalide(req.params.id)) {
      return res.status(400).json({ erreur: 'ID reparation invalide.' });
    }

    if (req.body.prix !== undefined && Number.isNaN(Number(req.body.prix))) {
      return res.status(400).json({ erreur: 'Prix invalide.' });
    }

    if (req.body.coutPiece !== undefined && req.body.coutPiece !== '' && Number.isNaN(Number(req.body.coutPiece))) {
      return res.status(400).json({ erreur: 'Cout de la piece invalide.' });
    }

    const reparation = await Reparation.findById(req.params.id);
    if (!reparation) {
      return res.status(404).json({ erreur: 'Reparation introuvable.' });
    }

    const ancienStatut = normaliserStatutReparation(reparation.statut);
    const updateData = preparerUpdateReparation(req.body, reparation);
    const nouveauStatut = updateData.statut || ancienStatut;

    const transition = transitionStatutAutorisee(ancienStatut, nouveauStatut, req.utilisateur || {});
    if (!transition.ok) {
      return res.status(409).json({ erreur: transition.raison });
    }

    reparation.set(updateData);

    if (nouveauStatut && nouveauStatut !== ancienStatut) {
      reparation.historiqueStatuts.push({
        de: ancienStatut,
        vers: nouveauStatut,
        date: new Date(),
        utilisateur: req.utilisateur && req.utilisateur.id,
        role: req.utilisateur && req.utilisateur.role,
        note: req.body.noteTransition || ''
      });
    }

    await reparation.save();

    if (reparation.produit) {
      await Produit.findByIdAndUpdate(reparation.produit, { datemodification: new Date() });
    }

    res.status(200).json({ message: 'Reparation mise a jour avec succes', reparation });
  } catch (err) {
    res.status(400).json({ erreur: err.message });
  }
});

router.delete('/reparations/:id', requirePermission('reparations', 'delete'), async (req, res) => {
  try {
    if (idInvalide(req.params.id)) {
      return res.status(400).json({ erreur: 'ID reparation invalide.' });
    }

    const reparation = await Reparation.findById(req.params.id);
    if (!reparation) {
      return res.status(404).json({ erreur: 'Reparation introuvable.' });
    }

    const factureLiee = await Facture.exists({ reparations: req.params.id });
    if (factureLiee) {
      return res.status(409).json({
        erreur: 'Impossible de supprimer cette reparation: elle est liee a une facture.'
      });
    }

    await reparation.deleteOne();

    if (reparation.produit) {
      await Produit.findByIdAndUpdate(reparation.produit, { datemodification: new Date() });
    }

    res.json({ message: 'Reparation supprimee' });
  } catch (err) {
    res.status(500).json({ erreur: err.message });
  }
});

router.post('/', requirePermission('reparations', 'create'), async (req, res) => {
  try {
    const reparation = await creerReparationDepuisBody(req.body, req.utilisateur);
    await reparation.save();
    await Produit.findByIdAndUpdate(reparation.produit, { datemodification: new Date() });
    res.status(201).json(reparation);
  } catch (err) {
    repondreErreurCreation(res, err);
  }
});

async function listerReparations(req, res) {
  try {
    const reparations = await Reparation.find()
      .populate({
        path: 'produit',
        populate: {
          path: 'clientId',
          select: 'nom prenom telephone email'
        }
      })
      .populate('client', 'nom prenom telephone email')
      .sort({ date: -1 });
    res.json(reparations);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

router.get('/reparations', requirePermission('reparations', 'read'), listerReparations);
router.get('/', requirePermission('reparations', 'read'), listerReparations);

router.get('/client/:clientId', requirePermission('reparations', 'read'), async (req, res) => {
  try {
    if (idInvalide(req.params.clientId)) {
      return res.status(400).json({ erreur: 'ID client invalide.' });
    }

    const reparations = await Reparation.find({ client: req.params.clientId }).sort({ date: -1 });
    res.json(reparations);
  } catch (err) {
    res.status(500).send(err.message);
  }
});

module.exports = router;

async function creerReparationDepuisBody(body, utilisateur) {
  const { produit, client, description, date, prix, coutPiece, statut, notes } = body;

  if (!produit || idInvalide(produit)) {
    const err = new Error('ID du produit requis ou invalide.');
    err.statusCode = 400;
    throw err;
  }

  if (!description || prix === undefined || Number.isNaN(Number(prix))) {
    const err = new Error('Description et prix valide requis.');
    err.statusCode = 400;
    throw err;
  }

  const produitExiste = await Produit.findById(produit);
  if (!produitExiste) {
    const err = new Error('Produit introuvable.');
    err.statusCode = 404;
    throw err;
  }

  const statutNormalise = normaliserStatutReparation(statut) || 'recu';
  const champDateStatut = champDatePourStatut(statutNormalise);

  return new Reparation({
    produit,
    client: client && !idInvalide(client) ? client : produitExiste.clientId,
    description,
    date: date || new Date(),
    prix: Number(prix),
    coutPiece: montant(coutPiece),
    statut: statutNormalise,
    notes: notes || '',
    historiqueStatuts: [{
      vers: statutNormalise,
      date: new Date(),
      utilisateur: utilisateur && utilisateur.id,
      role: utilisateur && utilisateur.role,
      note: 'Creation'
    }],
    ...(champDateStatut ? { [champDateStatut]: new Date() } : {})
  });
}

function repondreErreurCreation(res, err) {
  res.status(err.statusCode || 400).json({ erreur: err.message, error: err.message });
}

function preparerUpdateReparation(body, reparationExistante) {
  const updateData = { ...body };
  delete updateData.historiqueStatuts;
  delete updateData.noteTransition;

  if (updateData.prix !== undefined) {
    updateData.prix = Number(updateData.prix);
  }

  if (updateData.coutPiece !== undefined) {
    updateData.coutPiece = montant(updateData.coutPiece);
  }

  if (updateData.statut) {
    updateData.statut = normaliserStatutReparation(updateData.statut);
    const champDateStatut = champDatePourStatut(updateData.statut);
    if (champDateStatut && !updateData[champDateStatut] && !reparationExistante[champDateStatut]) {
      updateData[champDateStatut] = new Date();
    }
  }

  return updateData;
}

function montant(valeur) {
  if (valeur === '' || valeur === null || valeur === undefined) return 0;
  const nombre = Number.parseFloat(valeur);
  return Number.isFinite(nombre) ? nombre : 0;
}
