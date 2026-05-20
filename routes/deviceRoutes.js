const express = require('express');
const { execFile } = require('child_process');
const { promisify } = require('util');
const { requireRole } = require('../middleware/permissions');

const router = express.Router();
const execFileAsync = promisify(execFile);
const COMMANDE_TIMEOUT_MS = 5000;

router.get('/detect', requireRole('admin'), async (req, res) => {
  const tentatives = [];

  const android = await detecterAndroid();
  tentatives.push(android.resume);
  if (android.detected) {
    return res.json(android.payload);
  }

  const iphone = await detecterIphone();
  tentatives.push(iphone.resume);
  if (iphone.detected) {
    return res.json(iphone.payload);
  }

  res.json({
    detected: false,
    message: 'Aucun telephone compatible detecte. Verifiez le cable USB, le deverrouillage de l appareil et les outils ADB ou libimobiledevice.',
    tentatives
  });
});

async function detecterAndroid() {
  const devices = await executerCommande('adb', ['devices']);
  if (!devices.ok) {
    return resumeEchec('android', 'ADB introuvable ou inaccessible.');
  }

  const deviceId = lirePremierAndroidConnecte(devices.stdout);
  if (!deviceId) {
    return resumeEchec('android', 'Aucun appareil Android autorise par ADB.');
  }

  const [modele, produit, fabricant, serie, batterie] = await Promise.all([
    adbShell(deviceId, ['getprop', 'ro.product.model']),
    adbShell(deviceId, ['getprop', 'ro.product.name']),
    adbShell(deviceId, ['getprop', 'ro.product.manufacturer']),
    adbShell(deviceId, ['getprop', 'ro.serialno']),
    adbShell(deviceId, ['dumpsys', 'battery'])
  ]);

  const modeleNet = nettoyerSortie(modele.stdout);
  const fabricantNet = nettoyerSortie(fabricant.stdout);
  const produitNet = nettoyerSortie(produit.stdout);

  return {
    detected: true,
    resume: { type: 'android', ok: true },
    payload: {
      detected: true,
      type: 'android',
      produit: [fabricantNet, modeleNet || produitNet].filter(Boolean).join(' ') || 'Android',
      modele: modeleNet || produitNet,
      numeroSerie: nettoyerSortie(serie.stdout),
      etatBatterie: extraireBatterieAndroid(batterie.stdout),
      message: 'Telephone Android detecte avec ADB.'
    }
  };
}

async function detecterIphone() {
  const infos = await executerCommande('ideviceinfo', []);
  if (!infos.ok) {
    return resumeEchec('iphone', 'ideviceinfo introuvable ou aucun iPhone accessible.');
  }

  const valeurs = lirePairesIdevice(infos.stdout);
  const batterie = await executerCommande('ideviceinfo', ['-q', 'com.apple.mobile.battery', '-k', 'BatteryCurrentCapacity']);

  return {
    detected: true,
    resume: { type: 'iphone', ok: true },
    payload: {
      detected: true,
      type: 'iphone',
      produit: valeurs.DeviceName || 'iPhone',
      modele: valeurs.ProductType || valeurs.ProductName || 'iPhone',
      numeroSerie: valeurs.SerialNumber || '',
      etatBatterie: batterie.ok ? nettoyerPourcentage(batterie.stdout) : '',
      message: 'iPhone detecte avec libimobiledevice.'
    }
  };
}

function lirePremierAndroidConnecte(sortie) {
  return sortie
    .split(/\r?\n/)
    .map(ligne => ligne.trim())
    .filter(ligne => ligne && !ligne.startsWith('List of devices'))
    .map(ligne => ligne.split(/\s+/))
    .find(parts => parts[1] === 'device')?.[0];
}

function adbShell(deviceId, commande) {
  return executerCommande('adb', ['-s', deviceId, 'shell', ...commande]);
}

async function executerCommande(commande, args) {
  try {
    const { stdout, stderr } = await execFileAsync(commande, args, {
      timeout: COMMANDE_TIMEOUT_MS,
      windowsHide: true
    });
    return { ok: true, stdout, stderr };
  } catch (err) {
    return {
      ok: false,
      stdout: err.stdout || '',
      stderr: err.stderr || err.message || ''
    };
  }
}

function lirePairesIdevice(sortie) {
  return sortie.split(/\r?\n/).reduce((valeurs, ligne) => {
    const separateur = ligne.indexOf(':');
    if (separateur === -1) return valeurs;

    const cle = ligne.slice(0, separateur).trim();
    const valeur = ligne.slice(separateur + 1).trim();
    if (cle) valeurs[cle] = valeur;
    return valeurs;
  }, {});
}

function extraireBatterieAndroid(sortie) {
  const match = sortie.match(/level:\s*(\d+)/i);
  return match ? Number(match[1]) : '';
}

function nettoyerPourcentage(valeur) {
  const match = String(valeur || '').match(/\d+/);
  return match ? Number(match[0]) : '';
}

function nettoyerSortie(valeur) {
  return String(valeur || '').trim();
}

function resumeEchec(type, message) {
  return {
    detected: false,
    resume: { type, ok: false, message }
  };
}

module.exports = router;
