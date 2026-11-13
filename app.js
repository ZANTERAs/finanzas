import { loadAll, put, del, save, write } from './db.js';
import {
  today, ym, addMonths, money, parseMonto, cuotaAmount, shareInMonth, monthTotal, byCategory, cuotaStatus, sum,
  REDES, MONEDAS, checkCard, checkTx, cleanBackup, savingsByCategory, checkSaving, newId, byDateDesc, cashWithdrawal, fromAccount, formatMontoTexto, monthSplit,
} from './calc.js';
import { sampleData } from './sample.js';

const CATEGORIAS = ['Supermercado', 'Comida', 'Transporte', 'Servicios', 'Hogar', 'Salud', 'Ropa', 'Ocio', 'Viajes', 'Educación', 'Tecnología', 'Otros'];
// Colores aproximados de cada banco; se pueden cambiar al cargar la tarjeta.
const BANCOS = {
  Galicia: '#f37021', Santander: '#ec0000', BBVA: '#004481', Macro: '#002f6c', 'Nación': '#0072bb', Provincia: '#00843d',
  ICBC: '#c4161c', HSBC: '#db0011', Ciudad: '#009fe3', Supervielle: '#d7282f', Patagonia: '#00539f', Credicoop: '#00a651',
  Brubank: '#6f2cf3', 'Naranja X': '#fe5000', 'Mercado Pago': '#00b1ea', 'Ualá': '#3e5aff',
};

const AHORRO_SUGERIDAS = ['Cuenta de ahorros', 'Pago celular', 'Futuro viaje', 'Emergencias'];

// Un guardado que falla (sin espacio, base cortada) se avisa en vez de no hacer nada.
addEventListener('unhandledrejection', e =>
  alert(`No se pudo completar la acción (${e.reason?.message ?? e.reason}). Probá de nuevo; si sigue fallando, cerrá y volvé a abrir la app.`));

let cards = [], txs = [], savings = [], editTx = null, editCard = null, editSaving = null, histSel = null;
const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);
const empty = msg => `<li class="empty">${msg}</li>`;
const reload = async () => {
  [cards, txs, savings] = await loadAll();
  cards.sort((a, b) => a.banco.localeCompare(b.banco, 'es')); // la base las devuelve por id (al azar)
};
const motion = () => matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
// Pesos y dólares no se suman: un renglón por cada moneda usada (siempre al menos pesos).
// Montos de 8+ dígitos achican la letra ("long") para no salirse del recuadro.
const porMoneda = (sel, amountOf, usadas) => {
  const lines = (usadas.length ? usadas : ['ARS']).map(m => money(amountOf(m), m));
  const el = $(sel);
  el.innerHTML = lines.map(l => `<span>${l}</span>`).join('');
  el.classList.toggle('long', lines[0].length > 12);
};
const usadas = items => MONEDAS.filter(m => items.some(x => x.moneda === m));
// Valor a la derecha de una fila de menú: uno o más renglones (lines ya es HTML seguro: montos o el ▲▼ de delta) y una leyenda
const menuVal = (sel, lines, caption) => {
  const el = $(sel);
  el.hidden = !lines.length;
  el.innerHTML = lines.map(l => `<b>${l}</b>`).join('') + `<small>${caption}</small>`;
};
// Compras en cuotas que todavía tienen cuotas por pagar (la usan la hoja Cuotas y su fila del menú)
const cuotasActivas = cur => txs.filter(t => t.cuotas > 1).map(t => ({ t, ...cuotaStatus(t, cur) })).filter(x => x.restantes > 0);
// Campo Monto: se formatea mientras escribís (700000 → 700.000) sin mover el cursor de entre las cifras.
function montoVivo(input) {
  input.addEventListener('input', () => {
    const { value, selectionStart } = input;
    const antes = value.slice(0, selectionStart).replace(/[^\d,]/g, '').length; // cifras y coma antes del cursor
    const nuevo = formatMontoTexto(value);
    if (nuevo === value) return;
    input.value = nuevo;
    let pos = 0;
    for (let n = 0; pos < nuevo.length && n < antes; pos++) if (/[\d,]/.test(nuevo[pos])) n++;
    input.setSelectionRange(pos, pos);
  });
}
// Error al lado del campo (globo nativo) en vez de alert; se borra apenas se vuelve a escribir.
const fieldError = (input, msg) => {
  input.setCustomValidity(msg);
  input.reportValidity();
  input.addEventListener('input', () => input.setCustomValidity(''), { once: true });
};
// Desactiva el botón mientras guarda: un doble toque no crea un duplicado.
const busy = fn => async e => {
  e.preventDefault();
  const b = e.submitter;
  if (b) b.disabled = true;
  try { await fn(); } finally { if (b) b.disabled = false; }
};
// Formularios a medio cargar: se avisa antes de salir sin guardar.
let dirty = false, lastHash = location.hash;
document.addEventListener('input', e => { if (e.target.form) dirty = true; });
const leave = hash => { dirty = false; location.hash = hash; };

const monthDate = m => new Date(m.slice(0, 4), m.slice(5) - 1, 1);
const monthName = m => monthDate(m).toLocaleDateString('es-AR', { month: 'long', year: 'numeric' }).replace(' de ', ' ');
const monthShort = m => monthDate(m).toLocaleDateString('es-AR', { month: 'short' }).replace('.', '');
const fmtDate = f => new Date(f.slice(0, 4), f.slice(5, 7) - 1, f.slice(8)).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' });

// Texto negro o blanco según qué tan claro sea el color de la tarjeta.
const ink = hex => { const n = parseInt(hex.slice(1), 16); return ((n >> 16) * 299 + (n >> 8 & 255) * 587 + (n & 255) * 114) / 1000 > 150 ? '#0b0b0b' : '#ffffff'; };
const cardStyle = c => `--card:${c.color};--card-ink:${ink(c.color)}`;
const cardFace = c => `<span class="top"><span class="bank">${esc(c.banco)}</span><span class="tipo">${c.tipo === 'debito' ? 'Débito' : 'Crédito'}</span></span>`
  + `<span class="num">•••• ${esc(c.ultimos4)}</span><span class="net">${esc(c.red)}</span>`;
const cardOf = t => cards.find(c => c.id === t.cardId);
const cardLabel = t => { const c = cardOf(t); return c ? `${c.banco} ${c.ultimos4}` : t.cardId ? 'Tarjeta borrada' : 'Efectivo / transferencia'; };

const txItem = (t, amount, extra = '') => `<li><a class="item" href="#nuevo/${esc(t.id)}">
  <span class="dot" style="${cardOf(t) ? `background:${cardOf(t).color}` : ''}"></span>
  <span class="grow"><b>${esc(t.descripcion)}</b><small>${esc(t.categoria)} · ${fmtDate(t.fecha)} · ${esc(cardLabel(t))}${extra}</small></span>
  <span class="amt">${money(amount, t.moneda)}</span></a></li>`;

const delta = (a, b) => {
  if (!b) return '—';
  const p = Math.round((a - b) / b * 100);
  return p === 0 ? '= 0%' : `<span class="${p > 0 ? 'up' : 'down'}">${p > 0 ? '▲' : '▼'} ${Math.abs(p)}%</span>`;
};

// ---------- Carrusel de tarjetas (Mis tarjetas y el medio de pago de Nuevo gasto) ----------
// Se desliza con scroll-snap nativo. La tarjeta actual es la que cruza la franja del medio del carrusel (rootMargin):
// así hay una sola aunque la pantalla sea ancha y entren dos enteras. Devuelve la función que, después de cada
// render, arma los puntos y vuelve a observar las tarjetas.
function carousel(list, dots, onCurrent) {
  const mark = i => { dots.querySelectorAll('button').forEach((d, j) => d.toggleAttribute('aria-current', j === i)); onCurrent(i); };
  const io = new IntersectionObserver(entries => entries.forEach(e => {
    if (e.isIntersecting) mark([...list.children].indexOf(e.target));
  }), { root: list, rootMargin: '0px -45%' });
  dots.addEventListener('click', e => {
    const i = e.target.closest('[data-i]')?.dataset.i;
    if (i) list.children[i].scrollIntoView({ behavior: motion(), inline: 'center', block: 'nearest' });
  });
  return labels => {
    dots.innerHTML = labels.length > 1 ? labels.map((l, i) => `<button type="button" data-i="${i}" aria-label="${esc(l)}"></button>`).join('') : '';
    io.disconnect();
    [...list.children].forEach(el => io.observe(el));
  };
}

// ---------- Gráficos ----------
const charts = {};
// compact: el gráfico chico de la página principal (sin eje de montos, barras finas; el monto va en el globo al tocar)
function barChart(id, labels, data, { horizontal = false, highlight = -1, onPick, compact = false } = {}) {
  const css = getComputedStyle(document.documentElement), v = n => css.getPropertyValue(n).trim();
  charts[id]?.destroy();
  // Los valores también para lectores de pantalla (el canvas solo se ve)
  const canvas = document.getElementById(id);
  canvas.dataset.label ??= canvas.getAttribute('aria-label');
  canvas.setAttribute('aria-label', `${canvas.dataset.label}: ${labels.map((l, i) => `${l} ${money(data[i])}`).join(', ')}`);
  const valueAxis = { display: !compact, grid: { color: v('--grid') }, border: { display: false }, ticks: { color: v('--muted'), maxTicksLimit: 5, callback: n => n.toLocaleString('es-AR', { notation: 'compact' }) } };
  const catAxis = { grid: { display: false }, border: { color: v('--axis') }, ticks: { color: v('--ink-2'), font: { size: horizontal && !compact ? 13 : 11 }, autoSkip: false, maxRotation: 0 } };
  charts[id] = new Chart(canvas, {
    type: 'bar',
    data: { labels, datasets: [{
      data, borderRadius: 1.5, borderSkipped: 'start', maxBarThickness: compact ? 12 : horizontal ? 18 : 24,
      backgroundColor: data.map((_, i) => highlight < 0 || i === highlight ? v('--series') : v('--series-soft')),
    }] },
    options: {
      indexAxis: horizontal ? 'y' : 'x', maintainAspectRatio: false, animation: false,
      interaction: { mode: 'index', intersect: false, axis: horizontal ? 'y' : 'x' },
      plugins: { legend: { display: false }, tooltip: {
        displayColors: false, backgroundColor: v('--solid'), titleColor: v('--ink-2'), bodyColor: v('--ink'),
        borderColor: v('--glass-border'), borderWidth: 1, cornerRadius: 3, padding: 10, callbacks: { label: c => money(c.raw) },
      } },
      scales: horizontal ? { x: valueAxis, y: catAxis } : { x: catAxis, y: valueAxis },
      onClick: onPick && ((e, els) => els[0] && onPick(els[0].index)),
    },
  });
}
function categoryChart(id, m, compact = false) {
  let rows = byCategory(txs, m);
  // Al lado del total no entran todas: las 5 más grandes y el resto junto en "Otras" (el detalle está en Historial)
  if (compact && rows.length > 6) rows = [...rows.slice(0, 5), { categoria: 'Otras', total: sum(rows.slice(5).map(r => r.total)) }];
  const canvas = document.getElementById(id);
  canvas.closest('.box').hidden = !rows.length;
  canvas.parentElement.style.height = compact ? `${rows.length * 24 + 8}px` : `${rows.length * 34 + 32}px`;
  barChart(id, rows.map(r => r.categoria), rows.map(r => r.total), { horizontal: true, compact });
  return rows;
}

// Tabla de categorías (Por categoría e Historial): monto y comparación contra el mes `prev`,
// sumando al final las que ese mes tenía y este no (en $ 0).
function categoryTable(sel, rows, prev) {
  const prevRows = byCategory(txs, prev), prevBy = Object.fromEntries(prevRows.map(r => [r.categoria, r.total]));
  const gone = prevRows.filter(r => !rows.some(x => x.categoria === r.categoria)).map(r => ({ categoria: r.categoria, total: 0 }));
  $(sel).innerHTML = [...rows, ...gone]
    .map(r => `<tr><td>${esc(r.categoria)}</td><td>${money(r.total)}</td><td>${delta(r.total, prevBy[r.categoria])}</td></tr>`).join('');
}

// ---------- Pantallas ----------
const views = {
  // La página principal (siempre de fondo): el total del mes y, al lado, el gasto por categoría
  inicio() {
    const cur = ym(today());
    $('#inicio-mes').textContent = monthName(cur);
    const enMes = txs.filter(t => shareInMonth(t, cur)), monedas = usadas(enMes);
    porMoneda('#inicio-total', m => monthTotal(txs, cur, m), monedas);
    // Debajo: cuánto fue con tarjeta de crédito y cuánto salió de la cuenta (efectivo / transferencia / débito)
    const parte = key => (monedas.length ? monedas : ['ARS']).map(m => money(monthSplit(txs, cards, cur, m)[key], m)).join(' · ');
    $('#inicio-split').hidden = !enMes.length;
    $('#inicio-tarjeta').textContent = parte('tarjeta');
    $('#inicio-cuenta').textContent = parte('cuenta');
    categoryChart('chart-inicio', cur, true);

    // Resumen a la derecha de los menús (un renglón por moneda; vacío si no hay nada que mostrar)
    const movs = txs.filter(t => ym(t.fecha) === cur).length;
    menuVal('#mv-movimientos', movs ? [String(movs)] : [], 'este mes');
    const act = cuotasActivas(cur);
    menuVal('#mv-cuotas', usadas(act.map(x => x.t)).map(m => money(sum(act.filter(x => x.t.moneda === m).map(x => x.restante)), m)), 'por pagar');
    menuVal('#mv-ahorros', usadas(savings).map(m => money(sum(savings.filter(s => s.moneda === m).map(s => s.monto)), m)), 'ahorrado');
    const prev = addMonths(cur, -1), antes = monthTotal(txs, prev);
    menuVal('#mv-historial', antes ? [delta(monthTotal(txs, cur), antes)] : [], `vs ${monthName(prev).split(' ')[0]}`);
  },

  // Hoja que abre el recuadro "Por categoría": todas las categorías del mes, con la comparación contra el anterior
  categorias() {
    const cur = ym(today());
    $('#cat-mes').textContent = monthName(cur);
    categoryTable('#cat-tabla', categoryChart('chart-cat', cur), addMonths(cur, -1));
  },

  movimientos() {
    $('#movimientos-lista').innerHTML = [...txs].sort(byDateDesc).slice(0, 30)
      .map(t => txItem(t, t.monto, t.cuotas > 1 ? ` · ${t.cuotas} cuotas` : '')).join('')
      || empty('Todavía no cargaste gastos. Tocá + para empezar.');
  },

  nuevo(id) {
    const f = $('#tx-form'), t = txs.find(x => x.id === id);
    editTx = t || null;
    f.reset();
    $('#nuevo-titulo').textContent = t ? 'Editar gasto' : 'Nuevo gasto';
    $('#tx-borrar').hidden = !t;
    // Medio de pago en carrusel. Al editar un gasto cuya tarjeta se borró aparece "Tarjeta borrada", para conservarla al guardar.
    const missing = t?.cardId && !cardOf(t);
    $('#card-picker').innerHTML =
      (missing ? `<label class="bank-card cash"><input type="radio" name="cardId" value="${esc(t.cardId)}"><span class="bank">Tarjeta borrada</span></label>` : '')
      + cards.map(c => `<label class="bank-card" style="${cardStyle(c)}"><input type="radio" name="cardId" value="${esc(c.id)}" aria-label="${esc(c.banco)} terminada en ${esc(c.ultimos4)}">${cardFace(c)}</label>`).join('')
      + '<label class="bank-card cash"><input type="radio" name="cardId" value=""><span class="bank">Efectivo / transferencia</span></label>';
    pickerCarousel([...(missing ? ['Tarjeta borrada'] : []), ...cards.map(c => `${c.banco} terminada en ${c.ultimos4}`), 'Efectivo / transferencia']);
    // Gasto nuevo: viene elegido el medio de pago del último gasto (tarjeta o efectivo); sin gastos, la primera tarjeta.
    // Si esa tarjeta ya se borró, la primera.
    const last = [...txs].sort(byDateDesc)[0];
    const want = t ? t.cardId ?? '' : last ? last.cardId ?? '' : cards[0]?.id ?? '';
    const radios = [...f.querySelectorAll('[name=cardId]')];
    const radio = radios.find(r => r.value === want) ?? radios[0];
    radio.checked = true;
    radio.parentElement.scrollIntoView({ block: 'nearest', inline: 'center' });
    pagoHint();
    const cats = t && !CATEGORIAS.includes(t.categoria) ? [...CATEGORIAS, t.categoria] : CATEGORIAS;
    f.categoria.innerHTML = cats.map(c => `<option>${esc(c)}</option>`).join('');
    f.monto.value = t ? formatMontoTexto(String(t.monto).replace('.', ',')) : '';
    f.moneda.value = t?.moneda || 'ARS';
    f.descripcion.value = t?.descripcion || '';
    f.categoria.value = t?.categoria || CATEGORIAS[0];
    f.fecha.value = t?.fecha || today();
    f.fecha.max = today(); // un año mal elegido (2062) dejaría el gasto fuera de todos los totales
    f.cuotas.value = t?.cuotas || 1;
    cuotaHint();
  },

  cuotas() {
    const cur = ym(today());
    const activas = cuotasActivas(cur).sort((a, b) => a.restantes - b.restantes);
    const enCuotas = usadas(activas.map(x => x.t)), de = m => activas.filter(x => x.t.moneda === m);
    porMoneda('#cuotas-mes', m => sum(de(m).map(x => x.esteMes)), enCuotas);
    porMoneda('#cuotas-total', m => sum(de(m).map(x => x.restante)), enCuotas);
    $('#cuotas-lista').innerHTML = activas.map(({ t, pagadas, restantes, restante }) => `<li><a class="item" href="#nuevo/${esc(t.id)}">
      <span class="dot" style="${cardOf(t) ? `background:${cardOf(t).color}` : ''}"></span>
      <span class="grow"><b>${esc(t.descripcion)}</b>
        <small>${esc(cardLabel(t))} · ${t.cuotas} cuotas de ${money(cuotaAmount(t, 0), t.moneda)}</small>
        <progress max="${t.cuotas}" value="${pagadas}" aria-label="${pagadas} de ${t.cuotas} cuotas pagadas"></progress>
        <small>${pagadas}/${t.cuotas} pagadas · ${restantes} ${restantes === 1 ? 'restante' : 'restantes'}</small></span>
      <span class="amt">${money(restante, t.moneda)}<small>restante</small></span></a></li>`).join('')
      || empty('No tenés compras en cuotas pendientes.');
  },

  ahorros(id) {
    const by = Object.fromEntries(MONEDAS.map(m => [m, savingsByCategory(savings, m)]));
    porMoneda('#ahorros-total', m => sum(by[m].map(c => c.total)), usadas(savings));
    const cats = [...new Set(MONEDAS.flatMap(m => by[m].map(c => c.categoria)))];
    $('#ahorros-cats').innerHTML = cats.map(cat => {
      const saldos = MONEDAS.map(m => [m, by[m].find(c => c.categoria === cat)]).filter(([, c]) => c).map(([m, c]) => money(c.total, m));
      return `<li><div class="item"><span class="grow"><b>${esc(cat)}</b></span><span class="amt">${saldos.join('<br>')}</span></div></li>`;
    }).join('') || empty('Todavía no cargaste ahorros.');
    $('#ahorro-sugeridas').innerHTML = [...new Set([...cats, ...AHORRO_SUGERIDAS])].map(c => `<option value="${esc(c)}">`).join('');
    $('#ahorros-lista').closest('.box').hidden = !savings.length;
    $('#ahorros-lista').innerHTML = [...savings].sort(byDateDesc).map(s => {
      // Lo que salió por un gasto en efectivo se edita desde el gasto (así no quedan desparejos)
      const href = s.id.startsWith('gasto-') ? `#nuevo/${esc(s.id.slice(6))}` : `#ahorros/${esc(s.id)}`;
      return `<li><a class="item" href="${href}">
      <span class="grow"><b>${esc(s.categoria)}</b><small>${fmtDate(s.fecha)}${s.descripcion ? ` · ${esc(s.descripcion)}` : ''}</small></span>
      <span class="amt${s.monto > 0 ? ' in' : ''}">${s.monto > 0 ? '+' : '−'} ${money(Math.abs(s.monto), s.moneda)}</span></a></li>`;
    }).join('');
    const s = savings.find(x => x.id === id);
    id === 'nuevo' ? openSavingForm() : s ? openSavingForm(s) : closeSavingForm();
  },

  historial(id) {
    const cur = ym(today());
    if (id) histSel = id; // #historial/2026-06 abre ese mes
    const first = txs.reduce((min, t) => ym(t.fecha) < min ? ym(t.fecha) : min, addMonths(cur, -11));
    const months = [];
    for (let m = first; m <= cur; m = addMonths(m, 1)) months.push(m);
    if (!months.includes(histSel)) histSel = addMonths(cur, -1);
    $('#hist-mes').innerHTML = [...months].reverse()
      .map(m => `<option value="${m}"${m === histSel ? ' selected' : ''}>${monthName(m)}${m === cur ? ' (actual)' : ''}</option>`).join('');

    const last12 = months.slice(-12);
    barChart('chart-meses', last12.map(monthShort), last12.map(m => monthTotal(txs, m)), {
      highlight: last12.indexOf(histSel), onPick: i => pickMonth(last12[i]),
    });

    const prev = addMonths(histSel, -1), total = monthTotal(txs, histSel), totalPrev = monthTotal(txs, prev);
    porMoneda('#hist-total', m => monthTotal(txs, histSel, m), usadas(txs.filter(t => shareInMonth(t, histSel))));
    $('#hist-prev-label').textContent = `vs ${monthName(prev)} (${money(totalPrev)})`;
    $('#hist-delta').innerHTML = delta(total, totalPrev);

    categoryTable('#hist-tabla', categoryChart('chart-hist-cat', histSel), prev);

    $('#hist-lista').innerHTML = txs.filter(t => shareInMonth(t, histSel)).sort(byDateDesc).map(t => {
      const i = cuotaStatus(t, histSel).pagadas + 1;
      return txItem(t, shareInMonth(t, histSel), t.cuotas > 1 ? ` · cuota ${i}/${t.cuotas}` : '');
    }).join('') || empty('Sin gastos este mes.');
  },

  tarjetas(id) {
    // Cada tarjeta es un enlace a su formulario (#tarjetas/<id>); "Editar" apunta a la que se está viendo
    $('#tarjetas-lista').innerHTML = cards.map(c =>
      `<a class="bank-card" href="#tarjetas/${esc(c.id)}" style="${cardStyle(c)}" aria-label="Editar ${esc(c.banco)} terminada en ${esc(c.ultimos4)}">${cardFace(c)}</a>`).join('')
      || '<p class="empty">Todavía no agregaste tarjetas.</p>';
    $('#card-editar').hidden = !cards.length;
    if (cards.length) $('#card-editar').href = `#tarjetas/${cards[0].id}`;
    cardCarousel(cards.map(c => `Ver ${c.banco} terminada en ${c.ultimos4}`));
    const c = cards.find(x => x.id === id);
    id === 'nueva' ? openCardForm() : c ? openCardForm(c) : closeCardForm();
  },
};

// El mes elegido queda en la URL sin volver arriba de todo.
function pickMonth(m) { history.replaceState(null, '', `#historial/${m}`); lastHash = location.hash; views.historial(m); }
$('#hist-mes').addEventListener('change', e => pickMonth(e.target.value));

function onHashChange() {
  if (dirty && !confirm('Tenés cambios sin guardar. ¿Salir igual?')) { history.replaceState(null, '', lastHash); return; }
  route();
}

// Navegación: la dirección dice qué hoja está abierta encima de la página (#cuotas), qué formulario dentro de ella
// (#ahorros/<id>, #tarjetas/nueva) o Nuevo gasto (#nuevo). Sin nada (o #inicio) se ve solo la página principal.
// Las hojas se marcan con data-view y no con id: con id, el navegador saltaba hasta ellas.
let pageHash = '#inicio', current = { view: null, id: '' };
function route() {
  dirty = false;
  lastHash = location.hash;
  const [name, id = ''] = location.hash.slice(1).split('/');
  const view = views[name] && name !== 'inicio' ? name : null;
  const from = current.view;
  current = { view, id: decodeURIComponent(id) };
  document.body.dataset.view = view ?? '';
  if (view !== 'nuevo') pageHash = view ? location.hash : '#inicio';
  // Una sola hoja abierta; la página de atrás queda inerte (no se puede tocar ni enfocar)
  const sheet = view && $(`section.sheet[data-view="${view}"]`);
  document.querySelectorAll('section.sheet').forEach(s => { s.hidden = s !== sheet; });
  $('#pagina').inert = !!sheet;
  $('#atras').disabled = !upHash();
  views.inicio(); // la página de fondo siempre al día
  if (sheet) { sheet.scrollTop = 0; views[view](current.id); }
  // Foco (teclado y VoiceOver): al abrir una hoja va a su título; al cerrarla vuelve a la fila o al "+" que la abrió.
  // Solo al cambiar de hoja, para no sacarlo de un formulario que se abre dentro de la misma.
  if (view !== from) (sheet ? sheet.querySelector('h1') : $(`[href="#${from}"]`))?.focus({ preventScroll: true });
}

// Botón Atrás: sube un nivel. Nuevo gasto → donde estabas; formulario → su hoja; hoja → página principal.
function upHash() {
  const [name, id] = location.hash.slice(1).split('/');
  if (name === 'nuevo') return pageHash;
  if (id && name !== 'historial') return `#${name}`; // en Historial el id es el mes elegido, no un formulario
  return name && name !== 'inicio' ? '#inicio' : null;
}
const goUp = () => { const h = upHash(); if (h) location.hash = h; };
$('#atras').addEventListener('click', goUp);
addEventListener('keydown', e => { if (e.key === 'Escape') goUp(); }); // en la compu, Esc cierra la hoja

// ---------- Nuevo / editar gasto ----------
const txForm = $('#tx-form');
function cuotaHint() {
  const monto = parseMonto(txForm.monto.value), cuotas = parseInt(txForm.cuotas.value, 10);
  $('#cuota-hint').textContent = cuotas > 1 && monto > 0 ? `${cuotas} cuotas de ${money(cuotaAmount({ monto, cuotas }, 0), txForm.moneda.value)}` : '';
}
montoVivo(txForm.monto);
txForm.monto.addEventListener('input', cuotaHint);
txForm.cuotas.addEventListener('input', cuotaHint);
txForm.querySelectorAll('[name=moneda]').forEach(r => r.addEventListener('change', cuotaHint));
// La tarjeta que queda en el centro es la elegida; tocar una que asoma (o moverse con las flechas) la trae al centro.
const pickerCarousel = carousel($('#card-picker'), $('#picker-dots'), i => { $('#card-picker').children[i].querySelector('input').checked = true; pagoHint(); });
$('#card-picker').addEventListener('change', e => { e.target.parentElement.scrollIntoView({ behavior: motion(), inline: 'center', block: 'nearest' }); pagoHint(); });
// Con efectivo / transferencia o débito se avisa de dónde sale la plata.
const cuentaDe = () => savings.find(s => /^(cuenta de )?ahorros$/i.test(s.categoria))?.categoria ?? 'Cuenta de ahorros';
function pagoHint() {
  const v = txForm.querySelector('[name=cardId]:checked')?.value;
  $('#pago-hint').hidden = v === undefined || !fromAccount({ cardId: v || null }, cards);
  $('#pago-hint').textContent = `Se descuenta de “${cuentaDe()}”, en Ahorros.`;
}

txForm.addEventListener('submit', busy(async () => {
  const f = txForm, picked = f.querySelector('[name=cardId]:checked');
  const t = {
    moneda: 'ARS', ...editTx,
    id: editTx?.id || newId(),
    monto: parseMonto(f.monto.value),
    descripcion: f.descripcion.value.trim(),
    categoria: f.categoria.value,
    fecha: f.fecha.value,
    moneda: f.moneda.value,
    cardId: picked ? picked.value || null : editTx?.cardId ?? null,
    cuotas: parseInt(f.cuotas.value, 10),
  };
  if (!(t.monto > 0)) return fieldError(f.monto, 'Ingresá un monto válido, por ejemplo 15.000 o 1500,50.');
  if (!t.descripcion) return fieldError(f.descripcion, 'Escribí una descripción, por ejemplo “Supermercado”.');
  if (!checkTx(t)) return alert('Revisá los datos: falta la fecha o la cantidad de cuotas (de 1 a 72).');
  // Efectivo / transferencia o débito: además se descuenta de la cuenta de ahorros (si pasa a crédito, ese descuento se borra)
  await write(fromAccount(t, cards)
    ? { put: { transactions: [t], savings: [cashWithdrawal(t, cuentaDe())] } }
    : { put: { transactions: [t] }, del: { savings: [`gasto-${t.id}`] } });
  await reload();
  leave('#inicio');
}));

$('#tx-borrar').addEventListener('click', async () => {
  if (!editTx || !confirm(`¿Borrar “${editTx.descripcion}”?`)) return;
  await write({ del: { transactions: [editTx.id], savings: [`gasto-${editTx.id}`] } });
  await reload();
  leave('#inicio');
});

// ---------- Tarjetas ----------
const cardForm = $('#card-form');
$('#bancos').innerHTML = Object.keys(BANCOS).map(b => `<option value="${b}">`).join('');
cardForm.red.innerHTML = REDES.map(r => `<option>${r}</option>`).join('');

function openCardForm(c) {
  editCard = c || null;
  cardForm.reset();
  $('#card-titulo').textContent = c ? 'Editar tarjeta' : 'Nueva tarjeta';
  cardForm.banco.value = c?.banco || '';
  cardForm.red.value = c?.red || REDES[0];
  cardForm.tipo.value = c?.tipo || 'credito';
  cardForm.ultimos4.value = c?.ultimos4 || '';
  cardForm.color.value = c?.color || '#555555';
  $('#card-borrar').hidden = !c;
  $('#card-acciones').hidden = true;
  cardForm.hidden = false;
  cardForm.scrollIntoView({ behavior: motion(), block: 'start' });
}
function closeCardForm() { cardForm.hidden = true; $('#card-acciones').hidden = false; editCard = null; dirty = false; }

// Los formularios de tarjeta van por la dirección (#tarjetas/<id>, #tarjetas/nueva), con enlaces: así Atrás los cierra.
const cardCarousel = carousel($('#tarjetas-lista'), $('#tarjetas-dots'), i => { if (cards[i]) $('#card-editar').href = `#tarjetas/${cards[i].id}`; });
$('#card-cancelar').addEventListener('click', () => leave('#tarjetas'));
cardForm.banco.addEventListener('input', () => {
  const hit = Object.entries(BANCOS).find(([b]) => b.toLowerCase() === cardForm.banco.value.trim().toLowerCase());
  if (hit) cardForm.color.value = hit[1];
});
cardForm.addEventListener('submit', busy(async () => {
  const c = {
    id: editCard?.id || newId(),
    banco: cardForm.banco.value.trim(),
    red: cardForm.red.value,
    tipo: cardForm.tipo.value,
    ultimos4: cardForm.ultimos4.value.trim(),
    color: cardForm.color.value,
  };
  if (!c.banco) return fieldError(cardForm.banco, 'Escribí el banco, por ejemplo “Galicia”.');
  if (!checkCard(c)) return alert('Revisá los datos: van exactamente los últimos 4 dígitos de la tarjeta.');
  await put('cards', c);
  await reload();
  leave('#tarjetas');
}));
$('#card-borrar').addEventListener('click', async () => {
  if (!editCard || !confirm(`¿Borrar la tarjeta ${editCard.banco} ${editCard.ultimos4}? Los gastos ya cargados se mantienen.`)) return;
  await del('cards', editCard.id);
  await reload();
  leave('#tarjetas');
});

// ---------- Ahorros ----------
const savForm = $('#ahorro-form');
function openSavingForm(s) {
  editSaving = s || null;
  savForm.reset();
  $('#ahorro-titulo').textContent = s ? 'Editar ahorro' : 'Nuevo ahorro';
  savForm.tipo.value = s?.monto < 0 ? 'out' : 'in';
  savForm.moneda.value = s?.moneda || 'ARS';
  savForm.monto.value = s ? formatMontoTexto(String(Math.abs(s.monto)).replace('.', ',')) : '';
  savForm.categoria.value = s?.categoria || '';
  savForm.descripcion.value = s?.descripcion || '';
  savForm.fecha.value = s?.fecha || today();
  savForm.fecha.max = today();
  $('#ahorro-borrar').hidden = !s;
  $('#ahorro-nuevo').hidden = true;
  savForm.hidden = false;
  savForm.scrollIntoView({ behavior: motion(), block: 'start' });
}
function closeSavingForm() { savForm.hidden = true; $('#ahorro-nuevo').hidden = false; editSaving = null; dirty = false; }
const backToAhorros = async () => { await reload(); history.replaceState(null, '', '#ahorros'); route(); };

montoVivo(savForm.monto);
$('#ahorro-cancelar').addEventListener('click', () => leave('#ahorros'));
savForm.addEventListener('submit', busy(async () => {
  const monto = parseMonto(savForm.monto.value), cat = savForm.categoria.value.trim();
  if (!(monto > 0)) return fieldError(savForm.monto, 'Ingresá un monto válido, por ejemplo 50.000.');
  if (!cat) return fieldError(savForm.categoria, 'Escribí una categoría, por ejemplo “Futuro viaje”.');
  const s = {
    moneda: 'ARS', ...editSaving,
    id: editSaving?.id || newId(),
    monto: savForm.tipo.value === 'out' ? -monto : monto,
    moneda: savForm.moneda.value,
    // Reusa la categoría existente aunque se escriba con otras mayúsculas ("futuro viaje" = "Futuro viaje")
    categoria: savings.find(x => x.id !== editSaving?.id && x.categoria.toLowerCase() === cat.toLowerCase())?.categoria ?? cat,
    descripcion: savForm.descripcion.value.trim(),
    fecha: savForm.fecha.value,
  };
  if (!checkSaving(s)) return alert('Revisá los datos: elegí una fecha.');
  await put('savings', s);
  await backToAhorros();
}));
$('#ahorro-borrar').addEventListener('click', async () => {
  if (!editSaving || !confirm(`¿Borrar este movimiento de “${editSaving.categoria}”?`)) return;
  await del('savings', editSaving.id);
  await backToAhorros();
});

// ---------- Datos: backup, ejemplo, borrar ----------
$('#exportar').addEventListener('click', async () => {
  const json = JSON.stringify({ app: 'finanzas', version: 2, exportado: new Date().toISOString(), cards, transactions: txs, savings }, null, 2);
  const file = new File([json], `finanzas-${today()}.json`, { type: 'application/json' });
  const download = () => {
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(file), download: file.name });
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  // En iPhone la hoja de compartir permite "Guardar en Archivos"; en la compu, descarga directa.
  if (matchMedia('(pointer: coarse)').matches && navigator.canShare?.({ files: [file] })) {
    navigator.share({ files: [file] }).catch(err => err.name !== 'AbortError' && download());
  } else download();
});

$('#importar').addEventListener('change', async e => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  let data = null;
  try { data = cleanBackup(JSON.parse(await file.text())); } catch { /* JSON inválido: data queda null */ }
  if (!data) return alert('Ese archivo no es un backup de esta app, así que no se cambió nada. Elegí el .json que guardaste con “Exportar backup”.');
  if (!confirm(`Esto reemplaza todos tus datos por ${data.cards.length} tarjetas, ${data.transactions.length} gastos y ${data.savings.length} ahorros del backup. ¿Seguimos?`)) return;
  await save(data, true);
  await reload();
  alert('Backup importado.');
  route();
});

$('#ejemplo').addEventListener('click', async () => {
  const data = sampleData();
  if (!confirm(`Se agregan ${data.cards.length} tarjetas, ${data.transactions.length} gastos y ${data.savings.length} ahorros de ejemplo. Después podés borrarlos con “Borrar todos los datos”.`)) return;
  await save(data, false);
  await reload();
  leave('#inicio');
});

$('#borrar-todo').addEventListener('click', async () => {
  if (!confirm('¿Borrar TODAS las tarjetas, gastos y ahorros? No se puede deshacer (salvo que tengas un backup).')) return;
  await save({ cards: [], transactions: [] }, true);
  await reload();
  route();
});

// ---------- Arranque ----------
Chart.defaults.font.family = getComputedStyle(document.body).fontFamily;
try { await reload(); } catch (err) {
  // Sin esto la pantalla queda en blanco; el throw frena el arranque para no mostrar la app vacía como si no hubiera datos.
  $('main').innerHTML = `<p class="empty">No se pudieron abrir tus datos (${esc(err?.message ?? err)}). Cerrá la app y volvé a abrirla.</p>`;
  throw err;
}
route();
addEventListener('hashchange', onHashChange);
// Al cambiar claro/oscuro se redibujan los gráficos de la sección abierta (sin moverte ni tocar formularios).
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  views.inicio();
  if (['historial', 'categorias'].includes(current.view)) views[current.view](current.id);
});
// Estos dos son opcionales: si fallan no hay que mostrar el aviso de error.
navigator.storage?.persist?.().catch(() => {});
if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(err => console.warn('Sin modo offline:', err));
