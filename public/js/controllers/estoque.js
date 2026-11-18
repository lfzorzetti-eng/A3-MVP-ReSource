/** Materiais (RF04) e resíduos: listagem, cadastro, edição e exclusão. */

import { api } from '../infrastructure/index.js';
import { CAMPOS_MATERIAL } from '../entities/catalogo.js';

let editandoId = null;

/** Converte os campos numéricos do formulário. Campos vazios viram 0. */
export function numeros(dados, campos) {
  const out = { ...dados };
  for (const k of campos) out[k] = Number(out[k]) || 0;
  return out;
}

export const estoqueController = {
  /** Materiais filtrados e a lista de categorias existentes (para o filtro). */
  async listar({ q = '', categoria = '' } = {}) {
    const [rows, todos] = await Promise.all([api.materiais.listar({ q, categoria }), api.materiais.listar()]);
    return { rows, categorias: [...new Set(todos.map((m) => m.categoria))].sort() };
  },

  novo() {
    editandoId = null;
  },

  /** Busca o material e marca como em edição. Devolve só os campos do formulário. */
  async editar(id) {
    const doc = (await api.materiais.listar()).find((m) => m._id === id);
    if (!doc) return null;
    editandoId = doc._id;
    const campos = Object.fromEntries(CAMPOS_MATERIAL.map((k) => [k, doc[k] ?? '']));
    return { codigo: doc.codigo, campos };
  },

  async salvar(dados) {
    const corpo = numeros(dados, ['saldo', 'custo_unitario']);
    delete corpo._id;
    if (editandoId) await api.materiais.atualizar(editandoId, corpo);
    else await api.materiais.criar(corpo);
    editandoId = null;
  },

  excluir: (id) => api.materiais.excluir(id),
  reindexar: () => api.agente.reindexar(),

  listarResiduos: () => api.residuos.listar(),
  registrarResiduo: (dados) => api.residuos.registrar(numeros(dados, ['quantidade_kg'])),
};
