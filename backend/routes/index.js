/**
 * Rotas da API. Arquivo fino: só liga URL → guardas → controller.
 * Nenhuma regra de negócio mora aqui.
 */

const express = require('express');
const { wrap, requireAuth: login, requirePermission: allow, rateLimit } = require('../controllers/guardas');
const { RATE_LIMIT_CHAT, RATE_LIMIT_ANALISE, RATE_LIMIT_LOGIN } = require('../infrastructure/config');
const sistema = require('../controllers/sistema');
const auth = require('../controllers/auth');
const estoque = require('../controllers/estoque');
const painel = require('../controllers/painel');
const agente = require('../controllers/agente');

const r = express.Router();

// sistema
r.get('/health', wrap(sistema.health));
r.post('/llm/reconnect', login, allow('admin:ops'), sistema.reconectarLlm);
r.post('/reset', login, allow('demo:reset'), wrap(sistema.reset));

// autenticação (demo)
r.get('/auth/demo-users', auth.perfisDemo);
r.post('/auth/login', rateLimit(RATE_LIMIT_LOGIN), wrap(auth.login));
r.get('/auth/me', login, auth.eu);
r.post('/auth/logout', login, wrap(auth.logout));

// empresa
r.get('/empresa', login, wrap(estoque.empresa));
r.get('/indicadores', login, wrap(estoque.indicadores));
r.get('/politicas', login, wrap(estoque.politicas));

// materiais (RF04), resíduos e movimentações
r.get('/materiais', login, wrap(estoque.listarMateriais));
r.post('/materiais', login, allow('materiais:write'), wrap(estoque.criarMaterial));
r.put('/materiais/:id', login, allow('materiais:write'), wrap(estoque.atualizarMaterial));
r.delete('/materiais/:id', login, allow('materiais:write'), wrap(estoque.excluirMaterial));
r.get('/residuos', login, wrap(estoque.listarResiduos));
r.post('/residuos', login, allow('residuos:write'), wrap(estoque.criarResiduo));
r.get('/movimentacoes', login, wrap(estoque.listarMovimentacoes));

// dashboard (RF05), auditoria (RF06), análise com IA (RF01)
r.get('/dashboard', login, wrap(painel.dashboard));
r.get('/auditorias', login, wrap(painel.listarAuditorias));
r.post('/estoque/analise', login, allow('analise:run'), rateLimit(RATE_LIMIT_ANALISE), wrap(painel.analisarEstoque));

// busca vetorial (RF02), conversas e chat RAG (RF03)
r.post('/rag/reindex', login, allow('rag:reindex'), wrap(agente.reindexar));
r.get('/rag/search', login, wrap(agente.buscar));
r.get('/chats', login, wrap(agente.listarConversas));
r.post('/chats', login, wrap(agente.criarConversa));
r.get('/chats/:id', login, wrap(agente.abrirConversa));
r.delete('/chats/:id', login, wrap(agente.excluirConversa));
r.post('/chat', login, allow('chat:use'), rateLimit(RATE_LIMIT_CHAT), wrap(agente.perguntar));

// rota de API inexistente responde JSON, não HTML
r.use((req, res) => {
  res.status(404).json({ error: `rota de API não encontrada: ${req.method} ${req.originalUrl}` });
});

module.exports = r;
