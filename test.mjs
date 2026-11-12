// Self-check de calc.js: node test.mjs
import assert from 'node:assert/strict';
import { cuotaAmount, shareInMonth, monthTotal, byCategory, cuotaStatus, parseMonto, cleanBackup, addMonths, sum, savingsByCategory, newId, byDateDesc, cashWithdrawal, checkSaving, fromAccount, formatMontoTexto } from './calc.js';
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

// Backup completo (exportar → importar) con datos realistas: tiene que volver idéntico.
// Si el export y la validación del import se desalinean (un campo nuevo, una regla nueva), esto falla.
const backup = JSON.parse(JSON.stringify({ app: 'finanzas', version: 2, exportado: '2026-11-12T12:00:00.000Z', ...sampleData(new Date(2026, 10, 12)) }));
assert.deepEqual(cleanBackup(backup), { cards: backup.cards, transactions: backup.transactions, savings: backup.savings });
assert.ok(backup.transactions.some(t => t.cuotas > 1) && backup.savings.some(s => s.moneda === 'USD' && s.monto > 0) && backup.savings.some(s => s.monto < 0));

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

console.log('calc.js ok');
