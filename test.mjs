// Self-check de calc.js: node test.mjs
import assert from 'node:assert/strict';
import { cuotaAmount, shareInMonth, monthTotal, byCategory, cuotaStatus, parseMonto, cleanBackup, addMonths, sum, savingsByCategory, newId, byDateDesc, cashWithdrawal, checkSaving, fromAccount, formatMontoTexto, monthSplit,
  monthRange, dashboardRows, rowsByCategory, seriesPorDia, seriesPorMes, checkTx, subExpense, subPendientes, leerFactura, consumoPorMes, incomeInMonth, checkIncome, debitaCuenta, retirosSobrantes, mesResumen, mesesDeFilas, retirosAlGuardar, venceResumen, proximosVencimientos } from './calc.js';
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
// Se descuenta de la cuenta de ahorros: solo el débito (el efectivo ya no)
assert.deepEqual([null, 'deb', 'cred', 'vieja', 'borrada'].map(cardId => debitaCuenta({ cardId }, tarjetas)), [false, true, false, false, false]);
// Los descuentos viejos de gastos en efectivo sobran; los de débito quedan; uno sin gasto (huérfano) no se toca
const ret = id => ({ id: `gasto-${id}`, monto: -1, moneda: 'ARS', categoria: 'Cuenta de ahorros', descripcion: '', fecha: '2026-11-01' });
assert.deepEqual(retirosSobrantes([ret('e'), ret('d'), ret('x'), { ...ret('y'), id: 'a1' }],[{ ...t, id: 'e', cardId: null }, { ...t, id: 'd', cardId: 'deb' }]), ['gasto-e']);
// Día de cierre: después del cierre la compra pasa al resumen del mes siguiente (y sus cuotas arrancan ahí); débito y efectivo no cambian
const conCierre = [{ id: 'gal', tipo: 'credito', cierre: 22 }, { id: 'deb', tipo: 'debito', cierre: 22 }, { id: 'sin', tipo: 'credito' }];
assert.deepEqual([['gal', '2026-11-22'], ['gal', '2026-11-23'], ['gal', '2026-12-30'], ['deb', '2026-11-25'], ['sin', '2026-11-25'], [null, '2026-11-25'], ['borrada', '2026-11-25']]
  .map(([cardId, fecha]) => mesResumen({ cardId, fecha }, conCierre)), ['2026-11', '2026-12', '2027-01', '2026-11', '2026-11', '2026-11', '2026-11']);
// La app guarda ese mes en t.mes (no enumerable): las cuotas y los totales lo usan; sin él, el mes de la fecha
const tarde = Object.defineProperty({ ...t, cardId: 'gal', fecha: '2026-11-25' }, 'mes', { value: '2026-12' }); // 1000 en 3 cuotas
assert.deepEqual(['2026-11', '2026-12', '2027-02', '2027-03'].map(m => shareInMonth(tarde, m)), [0, 333.33, 333.33, 0]);
assert.equal(cuotaStatus(tarde, '2026-12').pagadas, 0);
assert.ok(!('mes' in JSON.parse(JSON.stringify(tarde))) && !('mes' in { ...tarde })); // no se guarda ni se exporta
// Cierre en el backup: se conserva; fuera de 1–31 se rechaza
assert.equal(cleanBackup({ cards: [{ ...card, cierre: 22 }], transactions: [] }).cards[0].cierre, 22);
assert.equal(cleanBackup({ cards: [{ ...card, cierre: 0 }], transactions: [] }), null);
assert.ok(!('cierre' in cleanBackup({ cards: [card], transactions: [] }).cards[0]));
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
// (las cargadas el 1/11 no tienen pendiente de octubre: ese mes todavía no existían)
const idDel = fecha => newId(new Date(`${fecha}T12:00`).getTime()); // id con el día en que se cargó, como en la app
const nf = { ...netflix, id: idDel('2026-11-01') }, cl = { ...claude, id: idDel('2026-11-01') };
assert.deepEqual(subPendientes([nf, cl], [], '2026-11-13').map(x => x.id), [`sub-${cl.id}-2026-11`]);
assert.deepEqual(subPendientes([nf, cl], [subExpense(cl, '2026-11')], '2026-11-13'), []);
assert.deepEqual(subPendientes([nf, cl], [], '2026-11-30').length, 2);
// Mes anterior: si no abriste la app a fin de mes, la del 28/10 se ofrece el 3/11, solo si la suscripción ya existía ese día
const del28 = { ...netflix, dia: 28 };
assert.deepEqual(subPendientes([{ ...del28, id: idDel('2026-09-15') }], [], '2026-11-03').map(x => x.fecha), ['2026-10-28']);
assert.deepEqual(subPendientes([{ ...del28, id: idDel('2026-10-28') }], [], '2026-11-03').map(x => x.fecha), ['2026-10-28']); // cargada ese mismo día
assert.deepEqual(subPendientes([{ ...del28, id: idDel('2026-11-02') }], [], '2026-11-03'), []);
assert.deepEqual(subPendientes([del28], [], '2026-11-03').map(x => x.fecha), ['2026-10-28']); // id sin fecha (ejemplo): cuenta como vieja
assert.deepEqual(subPendientes([del28], [subExpense(del28, '2026-10')], '2026-11-03'), []); // ya cargada: no se repite
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

// "Todo" en Gastos: los meses van del mes en que arranca cada gasto (con el cierre, el del resumen) a su última cuota,
// así el gráfico suma lo mismo que el total
const filasTodo = dashboardRows([tarde], conCierre, {});
assert.deepEqual(mesesDeFilas(filasTodo, '2026-11'), ['2026-11', '2026-12', '2027-01', '2027-02']);
assert.equal(sum(seriesPorMes(filasTodo, mesesDeFilas(filasTodo, '2026-11'))), 1000);

// Al guardar gastos: débito escribe su "Saqué"; efectivo y crédito borran el que hubiera;
// tarjeta borrada que ya tenía "Saqué" (era débito): se actualiza con su categoría; sin "Saqué": no se crea
const gasto = (id, cardId) => ({ ...t, id, cardId, cuotas: 1 });
const alGuardar = retirosAlGuardar([gasto('a', 'deb'), gasto('b', null), gasto('c', 'cred'), gasto('v', 'borrada'), gasto('d', 'borrada')],
  tarjetas, [{ ...ret('v'), categoria: 'Ahorros' }], 'Cuenta de ahorros');
assert.deepEqual(alGuardar.put.map(s => [s.id, s.categoria, s.monto]), [['gasto-a', 'Cuenta de ahorros', -1000], ['gasto-v', 'Ahorros', -1000]]);
assert.deepEqual(alGuardar.del, ['gasto-b', 'gasto-c', 'gasto-d']);

// Vencimiento: después del cierre → mes siguiente; antes del cierre → mismo mes; sin cierre → mes siguiente; 31 en febrero → 28
assert.deepEqual([[{ cierre: 22, vence: 5 }, '2026-11'], [{ cierre: 5, vence: 15 }, '2026-11'], [{ vence: 10 }, '2026-11'], [{ cierre: 22, vence: 31 }, '2026-02']]
  .map(([c, m]) => venceResumen(c, m)), ['2026-12-05', '2026-11-15', '2026-12-10', '2026-02-28']);
// Recordatorios: el resumen de noviembre de Galicia (cierra el 22, vence el 5) se avisa del 28/11 al 5/12, con su total
const gal = { id: 'gal', tipo: 'credito', cierre: 22, vence: 5 }, debVence = { id: 'deb', tipo: 'debito', vence: 5 };
const compra = Object.defineProperty({ ...t, id: 'v1', cardId: 'gal', fecha: '2026-11-10', cuotas: 2 }, 'mes', { value: '2026-11' }); // 500 + 500
const tarde22 = Object.defineProperty({ ...t, id: 'v2', cardId: 'gal', fecha: '2026-11-25', cuotas: 1 }, 'mes', { value: '2026-12' }); // va al de diciembre
const enDolares = Object.defineProperty({ ...t, id: 'v3', cardId: 'gal', fecha: '2026-11-12', cuotas: 1, monto: 20, moneda: 'USD' }, 'mes', { value: '2026-11' });
const avisar = hoy => proximosVencimientos([gal, debVence], [compra, tarde22, enDolares], hoy);
assert.deepEqual(avisar('2026-12-01').map(a => [a.card.id, a.resumen, a.fecha, a.montos]), [['gal', '2026-11', '2026-12-05', [['ARS', 500], ['USD', 20]]]]);
assert.equal(avisar('2026-12-05').length, 1); // vence hoy
assert.equal(avisar('2026-11-27').length, 0); // faltan 8 días
assert.equal(avisar('2026-11-28').length, 1); // faltan 7
assert.deepEqual(avisar('2026-12-06').map(a => [a.resumen, a.fecha, a.montos]), []); // el de diciembre vence el 5/1: falta mucho
assert.deepEqual(avisar('2026-12-30').map(a => [a.resumen, a.fecha, a.montos]), [['2026-12', '2027-01-05', [['ARS', 1500]]]]); // cuota 2 + la compra del 25/11
assert.equal(proximosVencimientos([gal], [], '2026-12-01').length, 0); // sin gastos en ese resumen: sin aviso
// Vencimiento en el backup: se conserva; fuera de 1–31 se rechaza
assert.equal(cleanBackup({ cards: [{ ...card, vence: 5 }], transactions: [] }).cards[0].vence, 5);
assert.equal(cleanBackup({ cards: [{ ...card, vence: 32 }], transactions: [] }), null);

console.log('calc.js ok');
