const Client = require('../models/clientModel');
const Produit = require('../models/produitModel');
const Reparation = require('../models/reparationModel');
const Facture = require('../models/Facture');
const Utilisateur = require('../models/utilisateur');
const {
  emailValide,
  telephoneValide,
  imeiValide
} = require('./validators');
const {
  normaliserStatutReparation: normaliserStatutWorkflow,
  champDatePourStatut
} = require('./reparationWorkflow');

async function genererRapportQualiteDonnees(options = {}) {
  const modeFix = options.fix === true;
  const rapport = {
    mode: modeFix ? 'fix' : 'diagnostic',
    issues: [],
    correctionsDisponibles: [],
    correctionsAppliquees: [],
    generatedAt: new Date().toISOString()
  };

  const [clients, produits, reparations, factures, utilisateurs] = await Promise.all([
    Client.find().lean(),
    Produit.find().lean(),
    Reparation.find().lean(),
    Facture.find().lean(),
    Utilisateur.find().lean()
  ]);

  const contexte = {
    clients,
    produits,
    reparations,
    factures,
    utilisateurs,
    clientsParId: indexerParId(clients),
    produitsParId: indexerParId(produits),
    reparationsParId: indexerParId(reparations),
    rapport,
    modeFix
  };

  analyserDoublons(contexte, 'client.email', 'client', clients, item => normaliserEmail(item.email));
  analyserDoublons(contexte, 'utilisateur.email', 'utilisateur', utilisateurs, item => normaliserEmail(item.email));
  analyserDoublons(contexte, 'produit.imei', 'produit', produits, item => normaliserImei(item.imei));
  analyserDoublons(contexte, 'facture.numeroFacture', 'facture', factures, item => (
    item.numeroFacture === undefined || item.numeroFacture === null ? undefined : String(item.numeroFacture)
  ));

  await analyserClients(contexte);
  await analyserProduits(contexte);
  await analyserReparations(contexte);
  await analyserFactures(contexte);
  await analyserUtilisateurs(contexte);

  rapport.summary = construireResume(rapport);
  return rapport;
}

async function analyserClients(contexte) {
  for (const client of contexte.clients) {
    if (!texte(client.nom) || !texte(client.prenom) || !texte(client.telephone)) {
      ajouterIssue(contexte, 'client.champsRequis', 'client', client._id, 'Nom, prenom ou telephone manquant.');
    }

    if (client.email && !emailValide(client.email)) {
      ajouterIssue(contexte, 'client.emailInvalide', 'client', client._id, `Email invalide: ${client.email}`);
    }

    if (client.telephone && !telephoneValide(client.telephone)) {
      ajouterIssue(contexte, 'client.telephoneInvalide', 'client', client._id, `Telephone invalide: ${client.telephone}`);
    }

    const update = construireUpdateNettoyage({
      nom: client.nom,
      prenom: client.prenom,
      telephone: client.telephone,
      email: normaliserEmail(client.email),
      photo: client.photo,
      notes: client.notes
    }, client);

    await appliquerCorrection(contexte, 'Client', Client, client._id, update);
  }
}

async function analyserProduits(contexte) {
  for (const produit of contexte.produits) {
    if (!texte(produit.nom)) {
      ajouterIssue(contexte, 'produit.nomManquant', 'produit', produit._id, 'Nom produit manquant.');
    }

    verifierNombrePositif(contexte, 'produit.prix', 'produit', produit._id, produit.prix);
    verifierNombrePositif(contexte, 'produit.prixachat', 'produit', produit._id, produit.prixachat);
    verifierNombrePositif(contexte, 'produit.prixvente', 'produit', produit._id, produit.prixvente);

    if (produit.etatbatterie !== undefined && produit.etatbatterie !== null) {
      const valeur = Number(produit.etatbatterie);
      if (Number.isNaN(valeur) || valeur < 0 || valeur > 100) {
        ajouterIssue(contexte, 'produit.etatbatterieInvalide', 'produit', produit._id, `Batterie invalide: ${produit.etatbatterie}`);
      }
    }

    const imeiNormalise = normaliserImei(produit.imei);
    if (imeiNormalise && !imeiValide(imeiNormalise)) {
      ajouterIssue(contexte, 'produit.imeiInvalide', 'produit', produit._id, `IMEI invalide: ${produit.imei}`);
    }

    if (produit.type === 'client' && !produit.clientId) {
      ajouterIssue(contexte, 'produit.clientManquant', 'produit', produit._id, 'Produit client sans clientId.');
    }

    if (produit.clientId && !contexte.clientsParId.has(String(produit.clientId))) {
      ajouterIssue(contexte, 'produit.clientIntrouvable', 'produit', produit._id, `Client introuvable: ${produit.clientId}`);
    }

    const update = construireUpdateNettoyage({
      nom: produit.nom,
      statut: normaliserStatutProduit(produit.statut),
      categorie: produit.categorie,
      model: produit.model,
      imei: imeiNormalise,
      disponibilite: normaliserDisponibilite(produit.disponibilite),
      notes: produit.notes
    }, produit);

    await appliquerCorrection(contexte, 'Produit', Produit, produit._id, update);
  }
}

async function analyserReparations(contexte) {
  for (const reparation of contexte.reparations) {
    if (!reparation.produit) {
      ajouterIssue(contexte, 'reparation.produitManquant', 'reparation', reparation._id, 'Reparation sans produit.');
    } else if (!contexte.produitsParId.has(String(reparation.produit))) {
      ajouterIssue(contexte, 'reparation.produitIntrouvable', 'reparation', reparation._id, `Produit introuvable: ${reparation.produit}`);
    }

    if (reparation.client && !contexte.clientsParId.has(String(reparation.client))) {
      ajouterIssue(contexte, 'reparation.clientIntrouvable', 'reparation', reparation._id, `Client introuvable: ${reparation.client}`);
    }

    if (!texte(reparation.description)) {
      ajouterIssue(contexte, 'reparation.descriptionManquante', 'reparation', reparation._id, 'Description manquante.');
    }

    verifierNombrePositif(contexte, 'reparation.prix', 'reparation', reparation._id, reparation.prix);

    const produit = reparation.produit ? contexte.produitsParId.get(String(reparation.produit)) : null;
    const clientDeduit = !reparation.client && produit && produit.clientId
      ? String(produit.clientId)
      : reparation.client;

    const statutNormalise = normaliserStatutReparation(reparation.statut);
    const champDateStatut = champDatePourStatut(statutNormalise);
    const champsAUpdate = {
      client: clientDeduit,
      description: reparation.description,
      statut: statutNormalise,
      notes: reparation.notes
    };

    if (champDateStatut && !reparation[champDateStatut]) {
      champsAUpdate[champDateStatut] = reparation.date || new Date();
    }

    if (!Array.isArray(reparation.historiqueStatuts) || reparation.historiqueStatuts.length === 0) {
      champsAUpdate.historiqueStatuts = [{
        vers: statutNormalise || 'recu',
        date: reparation[champDateStatut] || reparation.date || new Date(),
        role: '',
        note: 'Rattrapage historique initial'
      }];
    }

    const update = construireUpdateNettoyage(champsAUpdate, reparation);

    await appliquerCorrection(contexte, 'Reparation', Reparation, reparation._id, update);
  }
}

async function analyserFactures(contexte) {
  const reparationsDejaFacturees = new Map();

  for (const facture of contexte.factures) {
    if (!facture.numeroFacture) {
      ajouterIssue(contexte, 'facture.numeroManquant', 'facture', facture._id, 'Numero de facture manquant.');
    }

    if (!facture.client || !contexte.clientsParId.has(String(facture.client))) {
      ajouterIssue(contexte, 'facture.clientIntrouvable', 'facture', facture._id, `Client introuvable: ${facture.client || 'vide'}`);
    }

    if (!facture.produit || !contexte.produitsParId.has(String(facture.produit))) {
      ajouterIssue(contexte, 'facture.produitIntrouvable', 'facture', facture._id, `Produit introuvable: ${facture.produit || 'vide'}`);
    }

    if (!Array.isArray(facture.reparations) || facture.reparations.length === 0) {
      ajouterIssue(contexte, 'facture.reparationsManquantes', 'facture', facture._id, 'Facture sans reparation.');
    } else {
      for (const reparationId of facture.reparations) {
        const cle = String(reparationId);
        if (!contexte.reparationsParId.has(cle)) {
          ajouterIssue(contexte, 'facture.reparationIntrouvable', 'facture', facture._id, `Reparation introuvable: ${cle}`);
        }

        if (reparationsDejaFacturees.has(cle)) {
          ajouterIssue(
            contexte,
            'facture.reparationDupliquee',
            'facture',
            facture._id,
            `Reparation ${cle} deja facturee dans ${reparationsDejaFacturees.get(cle)}.`
          );
        } else {
          reparationsDejaFacturees.set(cle, facture._id);
        }
      }
    }

    if (facture.emailDestinataire && !emailValide(facture.emailDestinataire)) {
      ajouterIssue(contexte, 'facture.emailInvalide', 'facture', facture._id, `Email destinataire invalide: ${facture.emailDestinataire}`);
    }

    verifierNombrePositif(contexte, 'facture.totalHT', 'facture', facture._id, facture.totalHT);
    verifierNombrePositif(contexte, 'facture.totalTTC', 'facture', facture._id, facture.totalTTC);
    verifierNombrePositif(contexte, 'facture.tps', 'facture', facture._id, facture.tps);
    verifierNombrePositif(contexte, 'facture.tvq', 'facture', facture._id, facture.tvq);

    const update = construireUpdateNettoyage({
      emailDestinataire: normaliserEmail(facture.emailDestinataire),
      modePaiement: facture.modePaiement,
      notes: facture.notes,
      fichierPDF: facture.fichierPDF
    }, facture);

    await appliquerCorrection(contexte, 'Facture', Facture, facture._id, update);
  }
}

async function analyserUtilisateurs(contexte) {
  const admins = contexte.utilisateurs.filter(utilisateur => utilisateur.role === 'admin');
  if (admins.length === 0) {
    ajouterIssue(contexte, 'utilisateur.adminManquant', 'utilisateur', 'global', 'Aucun compte admin trouve.');
  }

  for (const utilisateur of contexte.utilisateurs) {
    if (!texte(utilisateur.email)) {
      ajouterIssue(contexte, 'utilisateur.emailManquant', 'utilisateur', utilisateur._id, 'Email manquant.');
    } else if (!emailValide(utilisateur.email)) {
      ajouterIssue(contexte, 'utilisateur.emailInvalide', 'utilisateur', utilisateur._id, `Email invalide: ${utilisateur.email}`);
    }

    const update = construireUpdateNettoyage({
      nom: utilisateur.nom,
      email: normaliserEmail(utilisateur.email)
    }, utilisateur);

    await appliquerCorrection(contexte, 'Utilisateur', Utilisateur, utilisateur._id, update);
  }
}

function analyserDoublons(contexte, code, entity, items, lireValeur) {
  const groupes = new Map();

  for (const item of items) {
    const valeur = lireValeur(item);
    if (!valeur) continue;
    if (!groupes.has(valeur)) groupes.set(valeur, []);
    groupes.get(valeur).push(String(item._id));
  }

  for (const [valeur, ids] of groupes.entries()) {
    if (ids.length > 1) {
      ajouterIssue(contexte, `${code}.doublon`, entity, valeur, `Doublon sur ${code}: ${ids.join(', ')}`, { ids });
    }
  }
}

function construireUpdateNettoyage(champs, documentOriginal) {
  const $set = {};
  const $unset = {};

  for (const [champ, valeur] of Object.entries(champs)) {
    const original = documentOriginal[champ];
    if (valeur === undefined || valeur === null || valeur === '') {
      if (original !== undefined && original !== null && original !== '') {
        $unset[champ] = '';
      }
      continue;
    }

    if (String(original ?? '') !== String(valeur)) {
      $set[champ] = valeur;
    }
  }

  const update = {};
  if (Object.keys($set).length) update.$set = $set;
  if (Object.keys($unset).length) update.$unset = $unset;
  return update;
}

async function appliquerCorrection(contexte, type, Model, id, update) {
  if (!update.$set && !update.$unset) return;

  const correction = {
    entity: type,
    id: String(id),
    update
  };

  if (!contexte.modeFix) {
    contexte.rapport.correctionsDisponibles.push(correction);
    return;
  }

  await Model.updateOne({ _id: id }, update, { runValidators: true });
  contexte.rapport.correctionsAppliquees.push(correction);
}

function verifierNombrePositif(contexte, code, entity, id, valeur) {
  if (valeur === undefined || valeur === null || valeur === '') return;
  const nombre = Number(valeur);
  if (Number.isNaN(nombre) || nombre < 0) {
    ajouterIssue(contexte, `${code}.invalide`, entity, id, `${code} invalide: ${valeur}`);
  }
}

function ajouterIssue(contexte, code, entity, id, message, meta = {}) {
  contexte.rapport.issues.push({
    id: `${code}:${String(id)}`,
    code,
    entity,
    entityId: String(id),
    severity: 'error',
    message,
    ...meta
  });
}

function construireResume(rapport) {
  const parEntite = {};
  const parCode = {};

  for (const issue of rapport.issues) {
    parEntite[issue.entity] = (parEntite[issue.entity] || 0) + 1;
    parCode[issue.code] = (parCode[issue.code] || 0) + 1;
  }

  return {
    issues: rapport.issues.length,
    correctionsDisponibles: rapport.correctionsDisponibles.length,
    correctionsAppliquees: rapport.correctionsAppliquees.length,
    parEntite,
    parCode
  };
}

function indexerParId(items) {
  return new Map(items.map(item => [String(item._id), item]));
}

function texte(valeur) {
  if (valeur === undefined || valeur === null) return undefined;
  const texteNettoye = String(valeur).trim();
  return texteNettoye || undefined;
}

function normaliserEmail(valeur) {
  const valeurTexte = texte(valeur);
  return valeurTexte ? valeurTexte.toLowerCase() : undefined;
}

function normaliserImei(valeur) {
  const valeurTexte = texte(valeur);
  return valeurTexte ? valeurTexte.replace(/\s+/g, '') : undefined;
}

function corrigerMojibake(valeur) {
  const valeurTexte = texte(valeur);
  if (!valeurTexte) return undefined;
  return valeurTexte
    .replace(/\u00c3\u00a9/g, '\u00e9')
    .replace(/\u00c3\u00a8/g, '\u00e8')
    .replace(/\u00c3\u0089/g, '\u00c9')
    .replace(/\u00c3\u00aa/g, '\u00ea');
}

function normaliserStatutProduit(valeur) {
  const statut = corrigerMojibake(valeur);
  if (!statut) return undefined;
  const minuscule = statut.toLowerCase();
  if (minuscule === 'neuf') return 'neuf';
  if (minuscule === 'bon \u00e9tat') return 'bon \u00e9tat';
  if (minuscule === 'mauvais \u00e9tat') return 'mauvais \u00e9tat';
  return statut;
}

function normaliserDisponibilite(valeur) {
  const disponibilite = corrigerMojibake(valeur);
  if (!disponibilite) return undefined;
  const minuscule = disponibilite.toLowerCase();
  if (minuscule === 'disponible') return 'disponible';
  if (minuscule === 'vendu') return 'vendu';
  if (minuscule === 'pour pi\u00e8ces') return 'Pour pi\u00e8ces';
  return disponibilite;
}

function normaliserStatutReparation(valeur) {
  return normaliserStatutWorkflow(corrigerMojibake(valeur));
}

module.exports = {
  genererRapportQualiteDonnees
};
