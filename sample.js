// Datos de ejemplo relativos a hoy. Los ids son fijos: cargarlos dos veces no duplica nada.
import { today } from './calc.js';

const CARDS = [
  { id: 'demo-galicia', banco: 'Galicia', red: 'Visa', tipo: 'credito', ultimos4: '4521', color: '#f37021' },
  { id: 'demo-santander', banco: 'Santander', red: 'Mastercard', tipo: 'credito', ultimos4: '8830', color: '#ec0000' },
  { id: 'demo-bbva', banco: 'BBVA', red: 'American Express', tipo: 'credito', ultimos4: '1007', color: '#004481' },
];
const GASTOS = [
  ['Supermercado Coto', 'Supermercado', 52000], ['Carga de nafta', 'Transporte', 45000], ['Pedido de sushi', 'Comida', 21000],
  ['Luz y gas', 'Servicios', 31000], ['Farmacia', 'Salud', 12500], ['Cine con amigos', 'Ocio', 16000],
  ['Verdulería', 'Supermercado', 9800], ['Internet y celular', 'Servicios', 28000], ['Café y medialunas', 'Comida', 6500], ['Carga SUBE', 'Transporte', 10000],
];
// [meses atrás, descripción, categoría, monto total, cuotas, tarjeta]
const EN_CUOTAS = [
  [4, 'Heladera', 'Hogar', 899000, 12, 0], [2, 'Pasajes a Bariloche', 'Viajes', 540000, 6, 2],
  [1, 'Zapatillas', 'Ropa', 180000, 3, 1], [0, 'Auriculares', 'Tecnología', 95000, 3, 0], [9, 'Colchón', 'Hogar', 420000, 6, 1],
];
// [meses atrás, categoría, monto (negativo = saqué), nota, moneda]
const AHORROS = [
  [5, 'Emergencias', 400000, ''], [3, 'Futuro viaje', 300000, 'Para el verano'], [1, 'Futuro viaje', 150000, ''],
  [2, 'Pago celular', 240000, 'Lo que queda de las cuotas del celular'], [0, 'Pago celular', -60000, 'Pagué una cuota'],
  [4, 'Futuro viaje', 800, 'Dólares para el viaje', 'USD'], [6, 'Emergencias', 1500, '', 'USD'],
];

export function sampleData(now = new Date()) {
  const fecha = (back, day) => today(new Date(now.getFullYear(), now.getMonth() - back, back ? day : Math.min(day, now.getDate())));
  const pago = [...CARDS.map(c => c.id), null];
  const transactions = [];
  for (let back = 6; back >= 0; back--) GASTOS.forEach(([descripcion, categoria, monto], i) => transactions.push({
    id: `demo-${back}-${i}`, monto: Math.round(monto * (0.75 + ((i * 7 + back * 3) % 6) / 10)), moneda: 'ARS',
    descripcion, categoria, fecha: fecha(back, 1 + (i * 3 + back) % 28), cardId: pago[(i + back) % 4], cuotas: 1,
  }));
  EN_CUOTAS.forEach(([back, descripcion, categoria, monto, cuotas, card], i) => transactions.push({
    id: `demo-c${i}`, monto, moneda: 'ARS', descripcion, categoria, fecha: fecha(back, 10), cardId: CARDS[card].id, cuotas,
  }));
  const savings = AHORROS.map(([back, categoria, monto, descripcion, moneda = 'ARS'], i) =>
    ({ id: `demo-a${i}`, monto, moneda, categoria, descripcion, fecha: fecha(back, 5) }));
  return { cards: CARDS, transactions, savings };
}
