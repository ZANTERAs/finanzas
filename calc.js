// Lógica pura (sin DOM): fechas, cuotas, totales, formato y validación. La testea test.mjs.

const pad = n => String(n).padStart(2, '0');
export const today = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const ym = fecha => fecha.slice(0, 7); // 'YYYY-MM-DD' -> 'YYYY-MM'
export const addMonths = (m, n) => { const [y, mo] = m.split('-').map(Number); return today(new Date(y, mo - 1 + n, 1)).slice(0, 7); };
// Meses de `desde` a `hasta`, inclusive ('2026-09', '2026-11' → ['2026-09', '2026-10', '2026-11'])
export const monthRange = (desde, hasta) => { const r = []; for (let m = desde; m <= hasta; m = addMonths(m, 1)) r.push(m); return r; };
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
// El gasto del mes partido en dos: con tarjeta de crédito, y lo que salió de la cuenta (efectivo / transferencia / débito).
// Las dos partes suman el total del mes.
export const monthSplit = (txs, cards, m, moneda = 'ARS') => {
  const parte = deLaCuenta => monthTotal(txs.filter(t => fromAccount(t, cards) === deLaCuenta), m, moneda);
  return { tarjeta: parte(false), cuenta: parte(true) };
};

function groupSum(items, value, moneda = 'ARS') {
  const acc = {};
  for (const x of items.filter(x => x.moneda === moneda)) { const v = value(x); if (v) acc[x.categoria] = (acc[x.categoria] || 0) + cents(v); }
  return Object.entries(acc).map(([categoria, c]) => ({ categoria, total: c / 100 })).sort((a, b) => b.total - a.total);
}
export const byCategory = (txs, m) => groupSum(txs, t => shareInMonth(t, m));
// Ahorros: monto positivo = guardé, negativo = saqué. Saldo por categoría en una moneda (pesos y dólares no se mezclan).
export const savingsByCategory = (savings, moneda = 'ARS') => groupSum(savings, s => s.monto, moneda);

// ---------- Dashboard de gastos ----------
const sinTildes = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
// Filas { t, monto } de los gastos que pasan los filtros. `months` = meses del período: cada gasto cuenta lo que cae en
// ellos (en cuotas, solo esas cuotas, igual que el total del mes); null = todo, con el monto completo.
// shortcut: "mayor/menor monto" compara el número sin convertir monedas (US$ 100 queda debajo de $ 100.000); pedir cotización si molesta
export function dashboardRows(txs, cards, { months = null, categoria = '', pago = '', texto = '', orden = 'nuevos' } = {}) {
  const q = sinTildes(texto.trim());
  const orders = {
    nuevos: (a, b) => byDateDesc(a.t, b.t),
    viejos: (a, b) => byDateDesc(b.t, a.t),
    mayor: (a, b) => b.monto - a.monto,
    menor: (a, b) => a.monto - b.monto,
  };
  return txs.map(t => ({ t, monto: months ? sum(months.map(m => shareInMonth(t, m))) : t.monto }))
    .filter(({ t, monto }) => monto > 0 && (!categoria || t.categoria === categoria)
      && (!pago || (pago === 'cuenta') === fromAccount(t, cards)) && (!q || sinTildes(t.descripcion).includes(q)))
    .sort(orders[orden] ?? orders.nuevos);
}
export const rowsByCategory = (rows, moneda = 'ARS') => groupSum(rows.map(r => ({ ...r.t, monto: r.monto })), x => x.monto, moneda);
// Serie por día de un mes: cada gasto en el día de su fecha (una cuota de una compra vieja cae en el mismo número de día).
export function seriesPorDia(rows, m, moneda = 'ARS') {
  const [y, mo] = m.split('-').map(Number), dias = new Date(y, mo, 0).getDate(), c = Array(dias).fill(0);
  for (const r of rows) if (r.t.moneda === moneda) c[Math.min(dias, Number(r.t.fecha.slice(8))) - 1] += cents(r.monto);
  return c.map(v => v / 100);
}
export const seriesPorMes = (rows, months, moneda = 'ARS') =>
  months.map(m => sum(rows.filter(r => r.t.moneda === moneda).map(r => shareInMonth(r.t, m))));

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

// ---------- Servicios (luz, gas, agua): el gasto puede llevar el consumo del período y la lectura del medidor ----------
export const UNIDADES = { Luz: 'kWh', Gas: 'm³', Agua: 'm³' };
// Consumos: los servicios de la casa (Servicios = los demás: celular, cable, expensas…)
export const SERVICIOS = ['Luz', 'Gas', 'Agua', 'Internet', 'Servicios'];
// Consumo (kWh o m³) de una categoría en cada mes, según la fecha de la factura; null = ese mes no hubo factura
// (luz y gas suelen ser bimestrales: el hueco no es un consumo cero)
export const consumoPorMes = (txs, categoria, months) => months.map(m => {
  const xs = txs.filter(t => t.categoria === categoria && t.consumo !== undefined && ym(t.fecha) === m);
  return xs.length ? sum(xs.map(t => t.consumo)) : null;
});

// ---------- Suscripciones (Netflix, Disney+, Claude…): se cobran todos los meses el mismo día ----------
// shortcut: solo mensuales; si aparece una anual, agregar la frecuencia
// El gasto de la suscripción s en el mes m. Id fijo por mes: cargarla dos veces no la duplica. Día 31 en un mes de 30 → el 30.
export function subExpense(s, m) {
  const [y, mo] = m.split('-').map(Number), dia = Math.min(s.dia, new Date(y, mo, 0).getDate());
  return { id: `sub-${s.id}-${m}`, monto: s.monto, moneda: s.moneda, descripcion: s.nombre, categoria: 'Suscripciones', fecha: `${m}-${pad(dia)}`, cardId: s.cardId, cuotas: 1 };
}
// Los gastos de este mes de las suscripciones que ya se cobraron (su día ya llegó) y todavía no se cargaron
export const subPendientes = (subs, txs, hoy) => subs.map(s => subExpense(s, ym(hoy))).filter(t => t.fecha <= hoy && !txs.some(x => x.id === t.id));

// ---------- Leer una factura: el texto copiado de la foto (en el iPhone, con Texto en vivo) ----------
// shortcut: reconoce las empresas grandes y los rótulos comunes ("Total a pagar", "Consumo … kWh / m3", "Lectura actual"); sumar acá las que no lea
const EMPRESAS = [
  [/edenor/i, 'Edenor', 'Luz'], [/edesur/i, 'Edesur', 'Luz'], [/\bepec\b/i, 'EPEC', 'Luz'], [/edelap/i, 'Edelap', 'Luz'], [/\bedea\b/i, 'EDEA', 'Luz'],
  [/edemsa/i, 'Edemsa', 'Luz'], [/\bepe\b/i, 'EPE', 'Luz'], [/metrogas/i, 'Metrogas', 'Gas'], [/naturgy/i, 'Naturgy', 'Gas'], [/camuzzi/i, 'Camuzzi', 'Gas'],
  [/litoral gas/i, 'Litoral Gas', 'Gas'], [/ecogas/i, 'Ecogas', 'Gas'], [/\baysa\b/i, 'AySA', 'Agua'], [/\babsa\b/i, 'ABSA', 'Agua'],
  [/aguas cordobesas/i, 'Aguas Cordobesas', 'Agua'], [/aguas santafesinas/i, 'Aguas Santafesinas', 'Agua'],
  [/telecentro/i, 'Telecentro', 'Internet'], [/fibertel/i, 'Fibertel', 'Internet'], [/movistar/i, 'Movistar', 'Internet'], [/\biplan\b/i, 'iPlan', 'Internet'],
];
// m³ también como lo devuelve la lectura de fotos (m3, m*, mts3); sin lookbehind, que los iPhone viejos no entienden
const M3 = /(?:^|[^a-z])m(?:ts)?[3³*]/i, UNIDAD = new RegExp(`kwh|${M3.source}`, 'i');
// Números de un renglón, sin las fechas (15/11/2026); peso = venía con "$" adelante
const numeros = linea => [...linea.replace(/\d{1,2}[/-]\d{1,2}[/-]\d{2,4}/g, ' ').matchAll(/(\$\s*)?(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:,\d{1,2})?)/g)]
  .map(m => ({ v: parseMonto(m[2]), peso: !!m[1] }));
// Devuelve solo lo que encontró: { descripcion, categoria, monto, consumo, lectura }
export function leerFactura(texto) {
  texto = String(texto);
  const lineas = texto.split(/\r?\n/), out = {};
  const emp = EMPRESAS.find(([re]) => re.test(texto));
  if (emp) [, out.descripcion, out.categoria] = emp;
  // Total: el mayor monto de los renglones con "total" (no subtotal ni consumo total); si alguno trae "$", solo esos
  const totales = lineas.filter(l => /total/i.test(l) && !/sub\s*total/i.test(l) && !UNIDAD.test(l)).flatMap(numeros);
  const montos = (totales.some(n => n.peso) ? totales.filter(n => n.peso) : totales).map(n => n.v).filter(v => v > 0);
  if (montos.length) out.monto = Math.max(...montos);
  const lc = lineas.find(l => /consumo/i.test(l) && UNIDAD.test(l)) ?? lineas.find(l => /\d/.test(l) && UNIDAD.test(l));
  const consumo = lc && numeros(lc)[0];
  if (consumo) out.consumo = consumo.v;
  const ll = lineas.find(l => /lectura\s*actual/i.test(l)), lectura = ll && numeros(ll)[0];
  if (lectura) out.lectura = lectura.v;
  // Sin empresa conocida: la unidad dice qué servicio es
  const cat = /kwh/i.test(texto) ? 'Luz' : !M3.test(texto) ? null : /agua/i.test(texto) ? 'Agua' : /gas/i.test(texto) ? 'Gas' : null;
  if (!out.categoria && cat) out.categoria = cat;
  return out;
}

export const REDES = ['Visa', 'Mastercard', 'American Express'];
export const TIPOS = ['credito', 'debito'];
export const MONEDAS = ['ARS', 'USD'];
const str = v => typeof v === 'string' && v.trim() !== '';
export const checkCard = c => str(c.id) && str(c.banco) && REDES.includes(c.red) && TIPOS.includes(c.tipo) &&
  /^\d{4}$/.test(c.ultimos4) && /^#[0-9a-f]{6}$/i.test(c.color);
export const checkTx = t => str(t.id) && Number.isFinite(t.monto) && t.monto > 0 && MONEDAS.includes(t.moneda) &&
  str(t.descripcion) && str(t.categoria) && /^\d{4}-\d{2}-\d{2}$/.test(t.fecha) &&
  Number.isInteger(t.cuotas) && t.cuotas >= 1 && t.cuotas <= 72 && (t.cardId === null || str(t.cardId)) && optNum(t.consumo) && optNum(t.lectura);
const optNum = v => v === undefined || (Number.isFinite(v) && v >= 0); // consumo y lectura: opcionales
export const checkSaving = s => str(s.id) && Number.isFinite(s.monto) && s.monto !== 0 && MONEDAS.includes(s.moneda) &&
  str(s.categoria) && typeof s.descripcion === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s.fecha);
// Ingreso (sueldo, freelance…): siempre positivo, con concepto y fecha; "meses" opcional (ver incomeInMonth)
export const checkIncome = i => str(i.id) && Number.isFinite(i.monto) && i.monto > 0 && MONEDAS.includes(i.moneda) &&
  str(i.descripcion) && /^\d{4}-\d{2}-\d{2}$/.test(i.fecha) &&
  (i.meses === undefined || (Number.isInteger(i.meses) && i.meses >= 0 && i.meses <= 120));
// Lo que un ingreso suma en el mes m. Se repite el mismo monto cada mes (no se divide, como las cuotas):
// sin "meses" = una sola vez; meses 0 = fijo, todos los meses desde el de la fecha; meses N = N meses seguidos.
export const incomeInMonth = (i, m) => { const k = monthDiff(ym(i.fecha), m); return k >= 0 && (i.meses === 0 || k < (i.meses ?? 1)) ? i.monto : 0; };
export const checkSub = s => str(s.id) && str(s.nombre) && Number.isFinite(s.monto) && s.monto > 0 && MONEDAS.includes(s.moneda) &&
  Number.isInteger(s.dia) && s.dia >= 1 && s.dia <= 31 && (s.cardId === null || str(s.cardId));

// Valida un backup importado y se queda solo con los campos conocidos (así nunca entra, p. ej., un número de tarjeta completo).
// Los backups viejos no traen "savings", "incomes" ni "subscriptions" (se importan con la lista vacía) ni el tipo de tarjeta (cuentan como crédito).
export function cleanBackup(d) {
  try {
    const cards = d.cards.map(({ id, banco, red, tipo = 'credito', ultimos4, color }) => ({ id, banco, red, tipo, ultimos4, color }));
    // consumo y lectura solo existen en gastos de luz, gas o agua
    const transactions = d.transactions.map(({ id, monto, moneda, descripcion, categoria, fecha, cardId = null, cuotas, consumo, lectura }) =>
      ({ id, monto, moneda, descripcion, categoria, fecha, cardId, cuotas, ...(consumo !== undefined && { consumo }), ...(lectura !== undefined && { lectura }) }));
    const savings = (d.savings ?? []).map(({ id, monto, moneda, categoria, descripcion = '', fecha }) => ({ id, monto, moneda, categoria, descripcion, fecha }));
    const incomes = (d.incomes ?? []).map(({ id, monto, moneda, descripcion, fecha, meses }) => ({ id, monto, moneda, descripcion, fecha, ...(meses !== undefined && { meses }) }));
    const subscriptions = (d.subscriptions ?? []).map(({ id, nombre, monto, moneda, dia, cardId = null }) => ({ id, nombre, monto, moneda, dia, cardId }));
    return cards.every(checkCard) && transactions.every(checkTx) && savings.every(checkSaving) && incomes.every(checkIncome) && subscriptions.every(checkSub)
      ? { cards, transactions, savings, incomes, subscriptions } : null;
  } catch {
    return null;
  }
}
