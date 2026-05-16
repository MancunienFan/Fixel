function nettoyerTexte(valeur) {
  if (valeur === undefined || valeur === null) return undefined;
  const texte = String(valeur).trim();
  return texte || undefined;
}

function nettoyerTexteMinuscule(valeur) {
  const texte = nettoyerTexte(valeur);
  return texte ? texte.toLowerCase() : undefined;
}

function nettoyerImei(valeur) {
  const texte = nettoyerTexte(valeur);
  return texte ? texte.replace(/\s+/g, '') : undefined;
}

function emailValide(valeur) {
  if (!valeur) return true;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(valeur);
}

function telephoneValide(valeur) {
  if (!valeur) return true;
  const chiffres = String(valeur).replace(/\D/g, '');
  return chiffres.length >= 7 && chiffres.length <= 15;
}

function imeiValide(valeur) {
  if (!valeur) return true;
  return /^\d{15}$/.test(valeur);
}

module.exports = {
  nettoyerTexte,
  nettoyerTexteMinuscule,
  nettoyerImei,
  emailValide,
  telephoneValide,
  imeiValide
};
