/**
 * localStorage/sessionStorage com reserva em memória. A reserva cobre testes
 * no Node e navegadores que bloqueiam o storage (aba anônima, por exemplo).
 */

function emMemoria() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
  };
}

function seguro(obterStorage) {
  const reserva = emMemoria();
  const alvo = () => {
    try {
      return obterStorage() || reserva;
    } catch {
      return reserva;
    }
  };
  return {
    getItem: (k) => { try { return alvo().getItem(k); } catch { return reserva.getItem(k); } },
    setItem: (k, v) => { try { alvo().setItem(k, v); } catch { reserva.setItem(k, v); } },
    removeItem: (k) => { try { alvo().removeItem(k); } catch { reserva.removeItem(k); } },
  };
}

export const local = seguro(() => globalThis.localStorage);
export const sessaoNavegador = seguro(() => globalThis.sessionStorage);
