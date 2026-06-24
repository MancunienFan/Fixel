function envoyerCsv(res, filename, rows, columns) {
  const csv = genererCsv(rows, columns);
  res.set({
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="${filename}"`
  });
  res.send(`\uFEFF${csv}`);
}

function genererCsv(rows, columns) {
  const header = columns.map(column => echapperCsv(column.label)).join(',');
  const lines = rows.map(row => columns
    .map(column => echapperCsv(lireValeur(row, column.key)))
    .join(','));

  return [header, ...lines].join('\r\n');
}

function lireValeur(row, key) {
  if (typeof key === 'function') return key(row);
  return String(key).split('.').reduce((valeur, segment) => (
    valeur === undefined || valeur === null ? undefined : valeur[segment]
  ), row);
}

function echapperCsv(value) {
  if (value === undefined || value === null) return '';
  const text = value instanceof Date
    ? value.toISOString()
    : String(value);
  return /[",\r\n]/.test(text)
    ? `"${text.replace(/"/g, '""')}"`
    : text;
}

function formatDate(value) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
}

function montant(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number.toFixed(2) : '0.00';
}

module.exports = {
  envoyerCsv,
  formatDate,
  montant
};
