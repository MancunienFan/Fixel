const STATUTS_REPARATION = [
  'recu',
  'diagnostic',
  'en attente piece',
  'en reparation',
  'pret',
  'livre',
  'annule'
];

const STATUTS_REPARATION_ACTIFS = [
  'recu',
  'diagnostic',
  'en attente piece',
  'en reparation',
  'pret'
];

const DATE_PAR_STATUT = {
  recu: 'dateReception',
  diagnostic: 'dateDiagnostic',
  'en attente piece': 'dateAttentePiece',
  'en reparation': 'dateDebutReparation',
  pret: 'datePret',
  livre: 'dateLivraison',
  annule: 'dateAnnulation'
};

const TRANSITIONS_REPARATION = {
  recu: ['diagnostic', 'annule'],
  diagnostic: ['en attente piece', 'en reparation', 'pret', 'annule'],
  'en attente piece': ['diagnostic', 'en reparation', 'annule'],
  'en reparation': ['en attente piece', 'pret', 'annule'],
  pret: ['en reparation', 'livre', 'annule'],
  livre: [],
  annule: []
};

const SLA_REPARATION_HEURES = {
  recu: 24,
  diagnostic: 48,
  'en attente piece': 168,
  'en reparation': 72,
  pret: 72
};

function normaliserStatutReparation(valeur) {
  if (!valeur) return undefined;

  const statut = valeur
    .toString()
    .trim()
    .toLowerCase()
    .replace(/\u00c3\u00a9/g, 'e')
    .replace(/\u00c3\u00a8/g, 'e')
    .replace(/\u00c3\u00aa/g, 'e')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  if (['recu', 'reception', 'en attente'].includes(statut)) return 'recu';
  if (statut === 'diagnostic') return 'diagnostic';
  if (['en attente piece', 'attente piece', 'piece'].includes(statut)) return 'en attente piece';
  if (['en reparation', 'en cours'].includes(statut)) return 'en reparation';
  if (['pret', 'terminee', 'termine'].includes(statut)) return 'pret';
  if (['livre', 'livree'].includes(statut)) return 'livre';
  if (['annule', 'annulee'].includes(statut)) return 'annule';

  return statut;
}

function champDatePourStatut(statut) {
  return DATE_PAR_STATUT[normaliserStatutReparation(statut)];
}

function estStatutActif(statut) {
  return STATUTS_REPARATION_ACTIFS.includes(normaliserStatutReparation(statut));
}

function libelleStatutReparation(statut) {
  const statutNormalise = normaliserStatutReparation(statut);
  const libelles = {
    recu: 'Recu',
    diagnostic: 'Diagnostic',
    'en attente piece': 'En attente piece',
    'en reparation': 'En reparation',
    pret: 'Pret',
    livre: 'Livre',
    annule: 'Annule'
  };

  return libelles[statutNormalise] || statut || '-';
}

function transitionStatutAutorisee(statutActuel, prochainStatut, utilisateur = {}) {
  const actuel = normaliserStatutReparation(statutActuel);
  const prochain = normaliserStatutReparation(prochainStatut);

  if (!actuel || !prochain || actuel === prochain) {
    return { ok: true };
  }

  if (!STATUTS_REPARATION.includes(actuel) || !STATUTS_REPARATION.includes(prochain)) {
    return { ok: false, raison: 'Statut de reparation invalide.' };
  }

  if (utilisateur.role === 'admin') {
    return { ok: true };
  }

  const transitions = TRANSITIONS_REPARATION[actuel] || [];
  if (transitions.includes(prochain)) {
    return { ok: true };
  }

  if (actuel === 'livre' || actuel === 'annule') {
    return {
      ok: false,
      raison: 'Cette reparation est terminee. Seul un admin peut modifier son statut.'
    };
  }

  return {
    ok: false,
    raison: `Transition non autorisee: ${libelleStatutReparation(actuel)} -> ${libelleStatutReparation(prochain)}.`
  };
}

function calculerSlaReparation(reparation, maintenant = new Date()) {
  const statut = normaliserStatutReparation(reparation && reparation.statut);
  const delaiHeures = SLA_REPARATION_HEURES[statut];

  if (!delaiHeures) {
    return {
      actif: false,
      statut,
      delaiHeures: 0,
      ageHeures: 0,
      depasse: false,
      criticite: 'ok',
      message: ''
    };
  }

  const dateReference = dateReferenceSla(reparation, statut);
  const ageHeures = differenceHeures(dateReference, maintenant);
  const heuresRestantes = delaiHeures - ageHeures;
  const depasse = heuresRestantes < 0;
  const criticite = depasse ? 'retard' : heuresRestantes <= Math.max(6, delaiHeures * 0.2) ? 'attention' : 'ok';

  return {
    actif: true,
    statut,
    delaiHeures,
    ageHeures,
    heuresRestantes,
    depasse,
    criticite,
    dateReference,
    message: messageSla(statut, ageHeures, delaiHeures, depasse)
  };
}

function dateReferenceSla(reparation, statut) {
  const champStatut = champDatePourStatut(statut);
  const candidats = [
    champStatut && reparation[champStatut],
    derniereDateHistorique(reparation.historiqueStatuts, statut),
    reparation.date
  ].filter(Boolean);

  for (const candidat of candidats) {
    const date = new Date(candidat);
    if (!Number.isNaN(date.getTime())) return date;
  }

  return new Date();
}

function derniereDateHistorique(historique, statut) {
  if (!Array.isArray(historique)) return null;

  return historique
    .filter(entree => normaliserStatutReparation(entree.vers) === statut && entree.date)
    .map(entree => new Date(entree.date))
    .filter(date => !Number.isNaN(date.getTime()))
    .sort((a, b) => b - a)[0] || null;
}

function differenceHeures(debut, fin) {
  const dateDebut = new Date(debut);
  const dateFin = new Date(fin);
  if (Number.isNaN(dateDebut.getTime()) || Number.isNaN(dateFin.getTime())) return 0;
  return Math.max(0, Math.round(((dateFin - dateDebut) / 36e5) * 10) / 10);
}

function messageSla(statut, ageHeures, delaiHeures, depasse) {
  const age = formaterDureeHeures(ageHeures);
  const delai = formaterDureeHeures(delaiHeures);
  const libelle = libelleStatutReparation(statut);
  return depasse
    ? `${libelle} depuis ${age}. SLA ${delai} depasse.`
    : `${libelle} depuis ${age}. SLA ${delai}.`;
}

function formaterDureeHeures(heures) {
  if (heures >= 48) return `${Math.round(heures / 24)} j`;
  if (heures >= 24) return `${Math.round((heures / 24) * 10) / 10} j`;
  return `${Math.round(heures * 10) / 10} h`;
}

module.exports = {
  STATUTS_REPARATION,
  STATUTS_REPARATION_ACTIFS,
  TRANSITIONS_REPARATION,
  SLA_REPARATION_HEURES,
  normaliserStatutReparation,
  champDatePourStatut,
  estStatutActif,
  libelleStatutReparation,
  transitionStatutAutorisee,
  calculerSlaReparation
};
