/**
 * Contrato comum do HTTP real (http.js) e do back falso (mock.js).
 * O client.js só conhece esta interface; trocar um pelo outro não toca nas telas.
 */

/**
 * @typedef {object} Requisicao
 * @property {'GET'|'POST'|'PUT'|'DELETE'} metodo
 * @property {string} endpoint                 caminho depois de /api, já com query (ex.: "/materiais?q=pead")
 * @property {object} [json]                   corpo da requisição
 * @property {string} [token]                  sessão (vira Authorization: Bearer)
 * @property {Record<string,string>} [cabecalhos]
 */

/**
 * @typedef {object} Transporte
 * @property {(req: Requisicao) => Promise<any>} enviar
 *   Devolve o JSON da resposta ou lança erroApi({status, semLogin, offline}).
 */

export {};
