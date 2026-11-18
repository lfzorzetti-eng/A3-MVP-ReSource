import { http, qs, exigir } from '../client.js';

export const materiais = {
  /** @returns {Promise<import('../../models/tipos.js').Material[]>} */
  listar: ({ q = '', categoria = '' } = {}) => http.get(`/materiais${qs({ q, categoria })}`),
  criar(dados) {
    exigir(dados?.nome, 'o nome');
    exigir(dados?.categoria, 'a categoria');
    return http.post('/materiais', dados);
  },
  atualizar: (id, dados) => http.put(`/materiais/${encodeURIComponent(exigir(id, 'o material'))}`, dados),
  excluir: (id) => http.delete(`/materiais/${encodeURIComponent(exigir(id, 'o material'))}`),
};

export const residuos = {
  /** @returns {Promise<import('../../models/tipos.js').Residuo[]>} */
  listar: () => http.get('/residuos'),
  registrar(dados) {
    exigir(dados?.nome, 'o nome');
    return http.post('/residuos', dados);
  },
};
