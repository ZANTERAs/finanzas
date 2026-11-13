// Wrapper mínimo de IndexedDB: un store por tipo de dato, keyPath 'id'.
const STORES = ['cards', 'transactions', 'savings', 'incomes'];
let conn;
const open = () => conn ||= new Promise((res, rej) => {
  const r = indexedDB.open('finanzas', 3);
  // v2 agrega "savings" y v3 "incomes"; solo crea lo que falta, así no se pierde nada de antes.
  r.onupgradeneeded = () => STORES.forEach(s => r.result.objectStoreNames.contains(s) || r.result.createObjectStore(s, { keyPath: 'id' }));
  r.onsuccess = () => res(r.result);
  r.onerror = () => rej(r.error);
});

// Corre fn en una sola transacción y resuelve cuando se confirma (todo o nada).
// Si falla, reabre la conexión y reintenta una vez (Safari puede cortarla con la app en segundo plano).
// Reintentar es seguro: una transacción fallida no deja nada escrito.
async function run(mode, fn, retry = true) {
  try {
    const t = (await open()).transaction(STORES, mode);
    const out = fn(Object.fromEntries(STORES.map(s => [s, t.objectStore(s)])));
    await new Promise((res, rej) => { t.oncomplete = res; t.onerror = t.onabort = () => rej(t.error); });
    return out;
  } catch (e) {
    conn = null;
    if (retry) return run(mode, fn, false);
    throw e;
  }
}

export const loadAll = () => run('readonly', s => STORES.map(n => s[n].getAll())).then(reqs => reqs.map(r => r.result));
export const put = (store, obj) => run('readwrite', s => { s[store].put(obj); });
// Varias escrituras juntas, todo o nada: { put: { store: [objetos] }, del: { store: [ids] } }
export const write = ({ put: puts = {}, del: dels = {} }) => run('readwrite', s => {
  Object.entries(puts).forEach(([n, objs]) => objs.forEach(o => s[n].put(o)));
  Object.entries(dels).forEach(([n, ids]) => ids.forEach(id => s[n].delete(id)));
});
export const del = (store, id) => run('readwrite', s => { s[store].delete(id); });
// Guarda { cards, transactions, savings, incomes }; con replace=true borra todo antes (import / borrar todo).
export const save = (data, replace) => run('readwrite', s => STORES.forEach(n => {
  if (replace) s[n].clear();
  (data[n] || []).forEach(o => s[n].put(o));
}));
