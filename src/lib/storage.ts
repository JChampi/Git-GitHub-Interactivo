import type { StateStorage } from 'zustand/middleware';

/**
 * Almacenamiento local tolerante a fallos: si localStorage no está disponible
 * (modo privado, cuota llena...) la app sigue funcionando en memoria.
 */
const memory = new Map<string, string>();

export const safeStorage: StateStorage = {
  getItem(name) {
    try {
      return window.localStorage.getItem(name) ?? memory.get(name) ?? null;
    } catch {
      return memory.get(name) ?? null;
    }
  },
  setItem(name, value) {
    memory.set(name, value);
    try {
      window.localStorage.setItem(name, value);
    } catch {
      /* cuota excedida o almacenamiento bloqueado: se conserva en memoria */
    }
  },
  removeItem(name) {
    memory.delete(name);
    try {
      window.localStorage.removeItem(name);
    } catch {
      /* ignorar */
    }
  },
};
