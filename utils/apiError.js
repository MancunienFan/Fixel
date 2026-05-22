function messageErreurPublique(err, fallback = 'Erreur serveur') {
  const message = String(err && err.message || fallback);
  return message
    .replace(/[A-Za-z]:\\[^\s'")]+/g, '[chemin masque]')
    .replace(/\/[^\s'")]+/g, '[chemin masque]');
}

function reponseErreur(res, err, statusCode = 500, fallback = 'Erreur serveur') {
  const statut = err && err.statusCode || statusCode;
  const message = statut >= 500 ? fallback : messageErreurPublique(err, fallback);
  return res.status(statut).json({ erreur: message, error: message });
}

module.exports = {
  messageErreurPublique,
  reponseErreur
};
