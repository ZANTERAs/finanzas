// Self-check de calc.js: node test.mjs
import assert from 'node:assert/strict';
import { cuotaAmount, shareInMonth, monthTotal, byCategory, cuotaStatus, parseMonto, cleanBackup, addMonths, sum, savingsByCategory, newId, byDateDesc, cashWithdrawal, checkSaving, fromAccount, formatMontoTexto, monthSplit,
  monthRange, dashboardRows, rowsByCategory, seriesPorDia, seriesPorMes, checkTx, subExpense, subPendientes, leerFactura, consumoPorMes, incomeInMonth, checkIncome } from './calc.js';
import { sampleData } from './sample.js';

const t = { id: 'a', monto: 1000, moneda: 'ARS', descripcion: 'Heladera', categoria: 'Hogar', fecha: '2026-11-20', cardId: null, cuotas: 3 };

// Las cuotas suman exacto el total
assert.deepEqual([0, 1, 2].map(i => cuotaAmount(t, i)), [333.33, 333.34, 333.33]);
assert.equal(sum([0, 1, 2].map(i => cuotaAmount(t, i))), 1000);

// Una cuota por mes desde el mes de compra, cruzando el año
assert.equal(shareInMonth(t, '2026-10'), 0);
assert.equal(shareInMonth(t, '2026-11'), 333.33);
assert.equal(shareInMonth(t, '2027-01'), 333.33);
assert.equal(shareInMonth(t, '2027-02'), 0);
assert.equal(addMonths('2026-11', 3), '2027-02');
assert.equal(addMonths('2026-01', -1), '2025-12');

assert.deepEqual(cuotaStatus(t, '2026-11'), { pagadas: 0, restantes: 3, restante: 1000, esteMes: 333.33 });
assert.deepEqual(cuotaStatus(t, '2027-01'), { pagadas: 2, restantes: 1, restante: 333.33, esteMes: 333.33 });
assert.equal(cuotaStatus(t, '2027-05').restantes, 0);

// Totales: cuota del mes + pagos únicos, sin USD
const uno = { ...t, id: 'c', monto: 500.5, cuotas: 1 };
const usd = { ...t, id: 'b', moneda: 'USD', cuotas: 1 };
const comida = { ...uno, id: 'd', categoria: 'Comida', monto: 900 };
assert.equal(monthTotal([t, uno, usd], '2026-11'), 833.83);
assert.deepEqual(byCategory([t, uno, comida], '2026-11'), [{ categoria: 'Comida', total: 900 }, { categoria: 'Hogar', total: 833.83 }]);

// Montos en formato argentino
assert.equal(parseMonto('1500'), 1500);
assert.equal(parseMonto('1.500'), 1500);
assert.equal(parseMonto('1.500,75'), 1500.75);
assert.equal(parseMonto('1500,5'), 1500.5);
assert.equal(parseMonto('12.5'), 12.5);
assert.equal(parseMonto('$ 2.000'), 2000);
assert.ok(Number.isNaN(parseMonto('abc')));
// El campo Monto se formatea mientras escribís, y lo que muestra se vuelve a leer igual
const tipeado = { '700000': '700.000', '1500,5': '1.500,5', '1234567,891': '1.234.567,89', '1.500': '1.500', '0005': '5', ',5': '0,5', '0,50': '0,50', '': '', '12a3': '123', '1,2,3': '1,23' };
for (const [entra, sale] of Object.entries(tipeado)) assert.equal(formatMontoTexto(entra), sale, entra);
for (const v of ['700000', '1500,5', '1234567,89', '999']) assert.equal(parseMonto(formatMontoTexto(v)), parseMonto(v.replace(/\./g, '')));
// Totales por moneda: los dólares van aparte
assert.equal(monthTotal([t, { ...t, id: 'u', moneda: 'USD', cuotas: 1, monto: 50 }], '2026-11', 'USD'), 50);

// Import: descarta campos extra y rechaza datos inválidos
const card = { id: 'k', banco: 'Galicia', red: 'Visa', ultimos4: '4521', color: '#f37021', numero: '4521000011112222' };
assert.equal(cleanBackup({ cards: [card], transactions: [t] }).cards[0].numero, undefined);
// Tarjetas de backups viejos (sin tipo) entran como crédito; un tipo desconocido se rechaza
assert.equal(cleanBackup({ cards: [card], transactions: [] }).cards[0].tipo, 'credito');
assert.equal(cleanBackup({ cards: [{ ...card, tipo: 'prepaga' }], transactions: [] }), null);
// De dónde sale la plata: efectivo y débito, de la cuenta; crédito y tarjeta borrada, no
const tarjetas = [{ id: 'cred', tipo: 'credito' }, { id: 'deb', tipo: 'debito' }, { id: 'vieja' }];
assert.deepEqual([null, 'deb', 'cred', 'vieja', 'borrada'].map(cardId => fromAccount({ cardId }, tarjetas)), [true, true, false, false, false]);
// Gasto del mes partido: tarjeta de crédito vs. efectivo/débito; las cuotas cuentan su parte del mes y todo suma el total
const mes = [
  { ...t, id: 'p1', cardId: 'cred', monto: 900, cuotas: 3 },   // 300 este mes, con tarjeta
  { ...t, id: 'p2', cardId: 'deb', monto: 150.5, cuotas: 1 },  // débito: de la cuenta
  { ...t, id: 'p3', cardId: null, monto: 49.5, cuotas: 1 },    // efectivo: de la cuenta
  { ...t, id: 'p4', cardId: 'cred', monto: 70, cuotas: 1, moneda: 'USD' }, // otra moneda: no se mezcla
];
assert.deepEqual(monthSplit(mes, tarjetas, '2026-11'), { tarjeta: 300, cuenta: 200 });
assert.equal(sum(Object.values(monthSplit(mes, tarjetas, '2026-11'))), monthTotal(mes, '2026-11'));
assert.deepEqual(monthSplit(mes, tarjetas, '2026-11', 'USD'), { tarjeta: 70, cuenta: 0 });

// Dashboard: período, filtros, búsqueda sin tildes y orden
assert.deepEqual(monthRange('2026-11', '2027-01'), ['2026-11', '2026-12', '2027-01']);
const g = [
  { ...t, id: 'a1', descripcion: 'Café', categoria: 'Comida', fecha: '2026-11-03', cardId: null, monto: 3000, cuotas: 1 },
  { ...t, id: 'a2', descripcion: 'Heladera', categoria: 'Hogar', fecha: '2026-10-15', cardId: 'cred', monto: 900, cuotas: 3 },
  { ...t, id: 'a3', descripcion: 'Super', categoria: 'Comida', fecha: '2026-11-20', cardId: 'deb', monto: 5000, cuotas: 1 },
  { ...t, id: 'a4', descripcion: 'Cine', categoria: 'Ocio', fecha: '2026-09-01', cardId: null, monto: 800, cuotas: 1 },
];
const ids = rows => rows.map(r => `${r.t.id}:${r.monto}`);
assert.deepEqual(ids(dashboardRows(g, tarjetas, { months: ['2026-11'] })), ['a3:5000', 'a1:3000', 'a2:300']); // la cuota 2 de la heladera cae en noviembre
assert.deepEqual(ids(dashboardRows(g, tarjetas, { months: ['2026-11'], orden: 'menor' })), ['a2:300', 'a1:3000', 'a3:5000']);
assert.deepEqual(ids(dashboardRows(g, tarjetas, { orden: 'viejos' })), ['a4:800', 'a2:900', 'a1:3000', 'a3:5000']); // todo: monto completo
assert.deepEqual(ids(dashboardRows(g, tarjetas, { categoria: 'Comida', pago: 'cuenta' })), ['a3:5000', 'a1:3000']);
assert.deepEqual(ids(dashboardRows(g, tarjetas, { pago: 'tarjeta' })), ['a2:900']);
assert.deepEqual(ids(dashboardRows(g, tarjetas, { texto: 'cafe' })), ['a1:3000']);
const nov = dashboardRows(g, tarjetas, { months: ['2026-11'] });
assert.deepEqual(rowsByCategory(nov), [{ categoria: 'Comida', total: 8000 }, { categoria: 'Hogar', total: 300 }]);
const dia = seriesPorDia(nov, '2026-11');
assert.equal(dia.length, 30); assert.equal(dia[2], 3000); assert.equal(dia[14], 300); assert.equal(dia[19], 5000);
assert.equal(sum(dia), sum(nov.map(r => r.monto))); // la serie suma el total del período
const tres = ['2026-09', '2026-10', '2026-11'];
assert.deepEqual(seriesPorMes(dashboardRows(g, tarjetas, { months: tres }), tres), [800, 300, 8300]);
assert.equal(cleanBackup({ cards: [{ ...card, ultimos4: '45210' }], transactions: [] }), null);
assert.equal(cleanBackup({ cards: [], transactions: [{ ...t, monto: -1 }] }), null);
assert.equal(cleanBackup({ cards: [null], transactions: [] }), null);
assert.equal(cleanBackup('hola'), null);

// Ahorros: saldo por categoría (guardé - saqué), sin USD; backups viejos sin "savings" siguen importando
const ah = (id, categoria, monto, moneda = 'ARS') => ({ id, monto, moneda, categoria, descripcion: '', fecha: '2026-11-01' });
assert.deepEqual(savingsByCategory([ah('1', 'Viaje', 300000), ah('2', 'Viaje', -50000.5), ah('3', 'Celular', 240000), ah('4', 'Viaje', 100, 'USD')]),
  [{ categoria: 'Viaje', total: 249999.5 }, { categoria: 'Celular', total: 240000 }]);
assert.deepEqual(savingsByCategory([ah('1', 'Viaje', 300000), ah('2', 'Viaje', 800, 'USD'), ah('3', 'Viaje', -150.25, 'USD')], 'USD'),
  [{ categoria: 'Viaje', total: 649.75 }]);
assert.deepEqual(cleanBackup({ cards: [], transactions: [] }).savings, []);
assert.equal(cleanBackup({ cards: [], transactions: [], savings: [ah('1', 'Viaje', 0)] }), null);
assert.equal(cleanBackup({ cards: [], transactions: [], savings: [ah('1', '', 10)] }), null);

// Ingresos: backups viejos sin "incomes" importan con la lista vacía; monto <= 0 o sin concepto no entra
const ing = { id: 'i1', monto: 1450000, moneda: 'ARS', descripcion: 'Sueldo', fecha: '2026-11-03' };
assert.deepEqual(cleanBackup({ cards: [], transactions: [] }).incomes, []);
assert.deepEqual(cleanBackup({ cards: [], transactions: [], incomes: [{ ...ing, extra: 1 }] }).incomes, [ing]);
assert.equal(cleanBackup({ cards: [], transactions: [], incomes: [{ ...ing, monto: -5 }] }), null);
assert.equal(cleanBackup({ cards: [], transactions: [], incomes: [{ ...ing, descripcion: ' ' }] }), null);

// Backup completo (exportar → importar) con datos realistas: tiene que volver idéntico.
// Si el export y la validación del import se desalinean (un campo nuevo, una regla nueva), esto falla.
const backup = JSON.parse(JSON.stringify({ app: 'finanzas', version: 2, exportado: '2026-11-12T12:00:00.000Z', ...sampleData(new Date(2026, 10, 12)) }));
assert.deepEqual(cleanBackup(backup), { cards: backup.cards, transactions: backup.transactions, savings: backup.savings, incomes: backup.incomes, subscriptions: backup.subscriptions });
assert.ok(backup.subscriptions.length && backup.transactions.some(t => t.consumo > 0));
assert.ok(backup.transactions.some(t => t.cuotas > 1) && backup.savings.some(s => s.moneda === 'USD' && s.monto > 0) && backup.savings.some(s => s.monto < 0));
assert.ok(backup.incomes.some(i => i.moneda === 'ARS') && backup.incomes.some(i => i.moneda === 'USD'));

// newId: ordenar ids = ordenar por cuándo se cargó, también al cruzar 2059 (la hora pasa de 8 a 9 caracteres)
assert.ok(newId(1_700_000_000_000) < newId(1_700_000_000_001));
assert.ok(newId(Date.UTC(2058, 0)) < newId(Date.UTC(2060, 0)));
// Orden de listas: fecha más nueva primero; mismo día, lo último cargado primero y los ids viejos (sin hora) al final
const at = (id, fecha = '2026-11-12') => ({ id, fecha });
const viejo = at('3f2a9c1e-0000-4000-8000-000000000000'), demo = at('demo-0-9');
const primero = at(newId(1_800_000_000_000)), segundo = at(newId(1_800_000_000_500)), manana = at('x', '2026-11-13');
assert.deepEqual([viejo, primero, demo, segundo, manana].sort(byDateDesc), [manana, segundo, primero, viejo, demo]);

// Gasto en efectivo: se resta entero (aunque sea en cuotas) de la cuenta de ahorros y queda atado al gasto
const enEfectivo = { ...t, id: 'g1', cardId: null, monto: 1500.5, descripcion: 'Verdulería' };
const retiro = cashWithdrawal(enEfectivo, 'Cuenta de ahorros');
assert.deepEqual(retiro, { id: 'gasto-g1', monto: -1500.5, moneda: 'ARS', categoria: 'Cuenta de ahorros', descripcion: 'Gasto: Verdulería', fecha: '2026-11-20' });
assert.ok(checkSaving(retiro));
assert.deepEqual(savingsByCategory([ah('s1', 'Cuenta de ahorros', 500000), retiro]), [{ categoria: 'Cuenta de ahorros', total: 498499.5 }]);

// Luz, gas y agua: consumo y lectura opcionales, nunca negativos; el backup los conserva solo si están
const luz = { ...t, id: 'l1', categoria: 'Luz', cuotas: 1, consumo: 250, lectura: 10500 };
assert.ok(checkTx(luz) && checkTx(t));
assert.ok(!checkTx({ ...luz, consumo: -1 }) && !checkTx({ ...luz, lectura: NaN }) && !checkTx({ ...luz, consumo: null }));
assert.deepEqual(cleanBackup({ cards: [], transactions: [luz, t] }).transactions, [luz, t]);
assert.ok(!('consumo' in cleanBackup({ cards: [], transactions: [t] }).transactions[0]));

// Suscripciones: el gasto del mes (id fijo), día 31 en noviembre → 30; pendientes = día ya llegado y sin cargar
const netflix = { id: 'n1', nombre: 'Netflix', monto: 11999, moneda: 'ARS', dia: 31, cardId: 'demo-galicia' };
const claude = { id: 'c1', nombre: 'Claude', monto: 20, moneda: 'USD', dia: 5, cardId: null };
assert.deepEqual(subExpense(netflix, '2026-11'), { id: 'sub-n1-2026-11', monto: 11999, moneda: 'ARS', descripcion: 'Netflix', categoria: 'Suscripciones', fecha: '2026-11-30', cardId: 'demo-galicia', cuotas: 1 });
assert.ok(checkTx(subExpense(netflix, '2026-02')) && subExpense(netflix, '2026-02').fecha === '2026-02-28');
assert.deepEqual(subPendientes([netflix, claude], [], '2026-11-13').map(x => x.id), ['sub-c1-2026-11']);
assert.deepEqual(subPendientes([netflix, claude], [subExpense(claude, '2026-11')], '2026-11-13'), []);
assert.deepEqual(subPendientes([netflix, claude], [], '2026-11-30').length, 2);
assert.equal(cleanBackup({ cards: [], transactions: [], subscriptions: [{ ...netflix, dia: 32 }] }), null);
assert.deepEqual(cleanBackup({ cards: [], transactions: [], subscriptions: [{ ...claude, extra: 1 }] }).subscriptions, [claude]);
assert.deepEqual(cleanBackup({ cards: [], transactions: [] }).subscriptions, []);

// Leer factura (texto copiado de la foto)
assert.deepEqual(leerFactura(`EDENOR S.A.
Factura B 0012-00345678
Período 15/09/2026 al 15/11/2026
Lectura anterior 10.250
Lectura actual 15/11/2026 10.500
Consumo 250 kWh
Subtotal $ 25.000,00
Total a pagar hasta el 1er vto. $ 31.250,45
Vencimiento 25/11/2026`), { descripcion: 'Edenor', categoria: 'Luz', monto: 31250.45, consumo: 250, lectura: 10500 });
assert.deepEqual(leerFactura('METROGAS\nConsumo del período: 45 m3\nConsumo total 45 m3\nTOTAL $18.430'), { descripcion: 'Metrogas', categoria: 'Gas', monto: 18430, consumo: 45 });
assert.deepEqual(leerFactura('Agua potable\nImporte total 9.876,50\nconsumo 12 m³'), { categoria: 'Agua', monto: 9876.5, consumo: 12 });
assert.deepEqual(leerFactura('hola'), {});
// Como sale de la foto: m³ leído como "m*", rótulo y monto separados por espacios
assert.deepEqual(leerFactura('Agua y Saneamientos\nConsumo 12 m*\nCargo fijo $ 4.100,00\nTotal a pagar $ 9.876,50'), { categoria: 'Agua', monto: 9876.5, consumo: 12 });
assert.deepEqual(leerFactura('Consumo 45m3 gas natural'), { categoria: 'Gas', consumo: 45 });
assert.equal(leerFactura('Total a pagar $ 100 (atención 24 hs)').categoria, undefined); // "hs" no es una unidad

// Consumos: kWh por mes según la fecha de cada factura; mes sin factura = null (no 0)
const fact = (id, fecha, consumo, categoria = 'Luz') => ({ ...t, id, fecha, cuotas: 1, categoria, ...(consumo !== undefined && { consumo }) });
assert.deepEqual(consumoPorMes([fact('1', '2026-09-10', 250), fact('2', '2026-11-12', 260.5), fact('3', '2026-11-20', 10), fact('4', '2026-11-01', 40, 'Gas'), fact('5', '2026-10-05')], 'Luz', ['2026-09', '2026-10', '2026-11']),
  [250, null, 270.5]);
assert.equal(leerFactura('TELECENTRO S.A.\nTotal a pagar $ 28.000').categoria, 'Internet');

// Ingresos que se repiten: una vez, fijo (todos los meses) o N meses; cada mes suma el monto entero
const prestamo = { id: 'p1', monto: 50000, moneda: 'ARS', descripcion: 'Devolución préstamo', fecha: '2026-11-20', meses: 3 };
assert.deepEqual(['2026-10', '2026-11', '2026-12', '2027-01', '2027-02'].map(m => incomeInMonth(prestamo, m)), [0, 50000, 50000, 50000, 0]);
assert.deepEqual(['2026-10', '2026-11', '2030-05'].map(m => incomeInMonth({ ...prestamo, meses: 0 }, m)), [0, 50000, 50000]);
assert.deepEqual(['2026-10', '2026-11', '2026-12'].map(m => incomeInMonth(ing, m)), [0, 1450000, 0]); // una sola vez
assert.ok(checkIncome(prestamo) && checkIncome({ ...prestamo, meses: 0 }) && !checkIncome({ ...prestamo, meses: 2.5 }) && !checkIncome({ ...prestamo, meses: -1 }));
assert.deepEqual(cleanBackup({ cards: [], transactions: [], incomes: [prestamo, ing] }).incomes, [prestamo, ing]);

console.log('calc.js ok');
