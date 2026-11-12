// Lógica pura (sin DOM): fechas, cuotas, totales, formato y validación. La testea test.mjs.

const pad = n => String(n).padStart(2, '0');
export const today = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const ym = fecha => fecha.slice(0, 7); // 'YYYY-MM-DD' -> 'YYYY-MM'
export const addMonths = (m, n) => { const [y, mo] = m.split('-').map(Number); return today(new Date(y, mo - 1 + n, 1)).slice(0, 7); };
const monthDiff = (a, b) => { const [ay, am] = a.split('-').map(Number), [by, bm] = b.split('-').map(Number); return (by - ay) * 12 + bm - am; };

const cents = v => Math.round(v * 100);
export const sum = values => values.reduce((s, v) => s + cents(v), 0) / 100;

// Cuota i (0 = la del mes de compra). Se reparte en centavos para que las cuotas sumen exacto el total.
export const cuotaAmount = (t, i) => { const c = cents(t.monto); return (Math.round(c * (i + 1) / t.cuotas) - Math.round(c * i / t.cuotas)) / 100; };

// Lo que el movimiento t cuesta en el mes m ('YYYY-MM'): una cuota por mes desde el mes de compra.
export const shareInMonth = (t, m) => { const i = monthDiff(ym(t.fecha), m); return i >= 0 && i < t.cuotas ? cuotaAmount(t, i) : 0; };

// Pesos y dólares no se suman: cada total es de una moneda (las pantallas muestran un renglón por moneda).
// shortcut: los gráficos (por categoría y por mes) muestran solo pesos; sumar dólares necesita una cotización.
export const monthTotal = (txs, m, moneda = 'ARS') => sum(txs.filter(t => t.moneda === moneda).map(t => shareInMonth(t, m)));

function groupSum(items, value, moneda = 'ARS') {
  const acc = {};
  for (const x of items.filter(x => x.moneda === moneda)) { const v = value(x); if (v) acc[x.categoria] = (acc[x.categoria] || 0) + cents(v); }
  return Object.entries(acc).map(([categoria, c]) => ({ categoria, total: c / 100 })).sort((a, b) => b.total - a.total);
}
export const byCategory = (txs, m) => groupSum(txs, t => shareInMonth(t, m));
// Ahorros: monto positivo = guardé, negativo = saqué. Saldo por categoría en una moneda (pesos y dólares no se mezclan).
export const savingsByCategory = (savings, moneda = 'ARS') => groupSum(savings, s => s.monto, moneda);

// Pagadas = cuotas de meses anteriores a m; la de m cuenta como pendiente de este mes.
export function cuotaStatus(t, m) {
  const n = t.cuotas, pagadas = Math.min(n, Math.max(0, monthDiff(ym(t.fecha), m))), c = cents(t.monto);
  return { pagadas, restantes: n - pagadas, restante: (c - Math.round(c * pagadas / n)) / 100, esteMes: shareInMonth(t, m) };
}

export const money = (v, moneda = 'ARS') =>
  v.toLocaleString('es-AR', { style: 'currency', currency: moneda, minimumFractionDigits: Number.isInteger(v) ? 0 : 2, maximumFractionDigits: 2 });

// Acepta formato argentino: "1.500" = mil quinientos, "1.500,75", "1500,5"; también "12.5".
export function parseMonto(s) {
  s = String(s).replace(/[\s$]/g, '');
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  return Math.round(Number(s) * 100) / 100;
}

// Lo que se ve en el campo Monto mientras escribís: miles con punto y decimales con coma ("700000" → "700.000").
// Los puntos que se tipean se ignoran (los pone la app); la coma es el decimal, con hasta 2 cifras.
export function formatMontoTexto(s) {
  const [ent, ...dec] = String(s).replace(/[^\d,]/g, '').split(',');
  const miles = ent.replace(/^0+(?=\d)/, '').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return dec.length ? `${miles || '0'},${dec.join('').slice(0, 2)}` : miles;
}

// Id que empieza con la hora de creación: ordenar ids = ordenar por cuándo se cargó (desempata gastos del mismo día).
// padStart(9): en base 36 la hora ocupa 8 caracteres hasta 2059 y 9 después; con el relleno el orden no se rompe.
export const newId = (now = Date.now()) => `${now.toString(36).padStart(9, '0')}-${crypto.randomUUID()}`;
// Más nuevo primero. Mismo día: lo último que se cargó; los ids viejos (sin hora) van después de los nuevos.
const loadedAt = x => /^[0-9a-z]{9}-/.test(x.id) ? x.id.slice(0, 9) : '';
export const byDateDesc = (a, b) => b.fecha.localeCompare(a.fecha) || loadedAt(b).localeCompare(loadedAt(a));

// La plata sale de la cuenta (y no del resumen de la tarjeta) si se pagó en efectivo / transferencia o con débito.
// Una tarjeta sin tipo (de antes de que existiera) cuenta como crédito.
export const fromAccount = (t, cards) => !t.cardId || cards.find(c => c.id === t.cardId)?.tipo === 'debito';
// Ese gasto → un "Saqué" en la cuenta de ahorros, atado al gasto por el id.
export const cashWithdrawal = (t, categoria) =>
  ({ id: `gasto-${t.id}`, monto: -t.monto, moneda: t.moneda, categoria, descripcion: `Gasto: ${t.descripcion}`, fecha: t.fecha });

export const REDES = ['Visa', 'Mastercard', 'American Express'];
export const TIPOS = ['credito', 'debito'];
export const MONEDAS = ['ARS', 'USD'];
const str = v => typeof v === 'string' && v.trim() !== '';
export const checkCard = c => str(c.id) && str(c.banco) && REDES.includes(c.red) && TIPOS.includes(c.tipo) &&
  /^\d{4}$/.test(c.ultimos4) && /^#[0-9a-f]{6}$/i.test(c.color);
export const checkTx = t => str(t.id) && Number.isFinite(t.monto) && t.monto > 0 && MONEDAS.includes(t.moneda) &&
  str(t.descripcion) && str(t.categoria) && /^\d{4}-\d{2}-\d{2}$/.test(t.fecha) &&
  Number.isInteger(t.cuotas) && t.cuotas >= 1 && t.cuotas <= 72 && (t.cardId === null || str(t.cardId));
export const checkSaving = s => str(s.id) && Number.isFinite(s.monto) && s.monto !== 0 && MONEDAS.includes(s.moneda) &&
  str(s.categoria) && typeof s.descripcion === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s.fecha);

// Valida un backup importado y se queda solo con los campos conocidos (así nunca entra, p. ej., un número de tarjeta completo).
// Los backups viejos no traen "savings" (se importan con la lista vacía) ni el tipo de tarjeta (cuentan como crédito).
export function cleanBackup(d) {
  try {
    const cards = d.cards.map(({ id, banco, red, tipo = 'credito', ultimos4, color }) => ({ id, banco, red, tipo, ultimos4, color }));
    const transactions = d.transactions.map(({ id, monto, moneda, descripcion, categoria, fecha, cardId = null, cuotas }) =>
      ({ id, monto, moneda, descripcion, categoria, fecha, cardId, cuotas }));
    const savings = (d.savings ?? []).map(({ id, monto, moneda, categoria, descripcion = '', fecha }) => ({ id, monto, moneda, categoria, descripcion, fecha }));
    return cards.every(checkCard) && transactions.every(checkTx) && savings.every(checkSaving) ? { cards, transactions, savings } : null;
  } catch {
    return null;
  }
}
