/**
 * Formato dos dados da API, só como tipos (JSDoc). Nenhum código roda aqui.
 * Os nomes de campo ficam como o back manda (`custo_unitario`, `latency_ms`).
 */

/**
 * @typedef {object} UsuarioPublico
 * @property {string} email
 * @property {string} name
 * @property {string} firstName
 * @property {'admin'|'gestor'|'estoque'|'residuos'|'auditor'} role
 * @property {string} roleLabel
 * @property {string} roleDescription
 * @property {string} sector
 * @property {string} title
 * @property {string} initials
 * @property {string[]} permissions  `*` concede tudo
 */

/**
 * @typedef {object} Material
 * @property {string} _id
 * @property {string} codigo        ex.: "INS-001"
 * @property {string} nome
 * @property {string} categoria
 * @property {string} unidade
 * @property {number} saldo
 * @property {number} custo_unitario
 * @property {string} fornecedor
 * @property {string} localizacao
 * @property {'Baixo'|'Médio'|'Alto'} risco
 * @property {string} descricao
 */

/**
 * @typedef {object} Residuo
 * @property {string} _id
 * @property {string} nome
 * @property {string} categoria
 * @property {number} quantidade_kg
 * @property {string} classe        "Não perigoso" ou "Perigoso - classe I"
 * @property {string} destino_atual
 * @property {string} gerado_em     AAAA-MM-DD
 * @property {string} fornecedor_destino
 */

/**
 * @typedef {object} Movimentacao
 * @property {string} _id
 * @property {string} material_id
 * @property {'entrada'|'saida'} tipo
 * @property {number} quantidade
 * @property {string} unidade
 * @property {string} motivo
 * @property {string} data
 */

/**
 * @typedef {object} Auditoria
 * @property {string} _id
 * @property {string} evento
 * @property {string} detalhe
 * @property {string} data          ISO
 * @property {string} usuario
 * @property {string} [usuario_email]
 * @property {string} [usuario_setor]
 * @property {string} [usuario_role]
 */

/**
 * @typedef {object} FonteRag
 * @property {string} collection
 * @property {number} score
 * @property {string} label
 */

/**
 * @typedef {object} MetaResposta
 * @property {'groq'|'fallback'|'mock'} source
 * @property {string} model
 * @property {number} latency_ms
 * @property {FonteRag[]} sources
 */

/**
 * @typedef {object} Mensagem
 * @property {'user'|'assistant'} role
 * @property {string} content
 * @property {MetaResposta} [meta]
 */

/**
 * @typedef {object} ResumoConversa
 * @property {string} _id
 * @property {string} titulo
 * @property {number} mensagens     quantidade
 * @property {string} updated_at
 * @property {string} usuario_nome
 * @property {string} usuario_email
 */

/**
 * @typedef {object} RespostaChat
 * @property {string} reply
 * @property {'groq'|'fallback'|'mock'} source
 * @property {string} model
 * @property {number} latency_ms
 * @property {string} chatId
 * @property {FonteRag[]} sources
 */

export {};
