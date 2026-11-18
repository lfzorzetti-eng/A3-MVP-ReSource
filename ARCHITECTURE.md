# Arquitetura do ReSource

Camadas com seta única, no back e no front. Cada camada só importa as que estão à direita dela. A regra é conferida por `test/camadas.test.js`: se alguém quebrar, o `npm test` falha.

## Back-end (`backend/`)

```
routes → controllers → infrastructure
            (todos podem ler entities)
```

| Pasta | Papel | Pode conter |
|---|---|---|
| `routes/index.js` | URL → guardas → controller | só a ligação. Nenhuma regra |
| `controllers/` | regra de cada recurso | validação, montagem da resposta, funções puras exportadas para teste |
| `controllers/guardas.js` | proteção das rotas | sessão (`requireAuth`), permissão (`requirePermission`), rate limit, `wrap` de async |
| `infrastructure/` | tudo que fala com fora | `config` (único que lê `process.env`), `db` (MongoDB ou arquivo), `vetores` (TF-IDF), `groq` (LLM + fallback), `sessao` (HMAC), `auditoria` |
| `entities/` | dados fixos | `perfis.js` (perfis, usuários demo, `can`), `prompts.js` (textos do agente) |

- `app.js` só monta o Express (middlewares, `ready`, `/api`, erro). `server.js` sobe o listener local; `api/index.js` exporta o mesmo app para a Vercel.
- **IA desacoplada (RNF03):** só `controllers/agente.js` e `controllers/painel.js` usam `infrastructure/groq.js`. Rotas de dados nunca dependem dele, e `groq.chat` sempre devolve algo (fallback quando o LLM falha).

## Front-end (`public/js/`)

```
main.js → screens → controllers → infrastructure
screens → components/ui
(todos podem ler entities e models)
```

| Pasta | Papel | Pode conter |
|---|---|---|
| `main.js` | entrada (papel das rotas) | monta as telas, liga as abas, decide login × plataforma |
| `screens/` | desenho de cada tela | HTML da tela, eventos do DOM. Nunca importa `infrastructure` |
| `controllers/` | estado e regra | conversa atual, item em edição, conversão do formulário, resumo do `/health`. Devolve objetos simples para a tela |
| `infrastructure/` | fala com a API | transporte `http` ou `mock`, `client`, `sessao`, `erros`, `config`, `recursos/` |
| `components/ui/` | peças sem regra | `$`, `esc`, formatação, `toast`, markdown, `mostrar`, `preencherOpcoes` |
| `entities/` | dados fixos | `catalogo.js` (categorias, riscos, classes, constantes), `permissoes.js` (`pode`) |
| `models/` | formato da API | só tipos em JSDoc (`tipos.js`) |

Cada camada tem um `index.js` com o contrato público: telas importam de `controllers/index.js`, controllers de `infrastructure/index.js`.

## Contrato da infrastructure do front

`infrastructure/index.js` exporta `api`, `sessao`, `mensagemErro`, `configurarClient` e `MODO_API`.

```js
api.auth.perfisDemo()                       // GET  /auth/demo-users
api.auth.entrar(email, senha)               // POST /auth/login  → { token, user }
api.auth.eu()                               // GET  /auth/me
api.auth.sair()                             // POST /auth/logout
api.sistema.saude()                         // GET  /health
api.sistema.restaurar(tokenAdmin)           // POST /reset (header x-admin-token)
api.painel.empresa()                        // GET  /empresa
api.painel.dashboard()                      // GET  /dashboard
api.painel.analisarEstoque()                // POST /estoque/analise
api.painel.auditorias()                     // GET  /auditorias
api.materiais.listar({ q, categoria })      // GET  /materiais
api.materiais.criar(dados)                  // POST /materiais (exige nome e categoria)
api.materiais.atualizar(id, dados)          // PUT  /materiais/:id
api.materiais.excluir(id)                   // DELETE /materiais/:id
api.residuos.listar()                       // GET  /residuos
api.residuos.registrar(dados)               // POST /residuos (exige nome)
api.agente.perguntar(msg, historico, chatId)// POST /chat
api.agente.conversas()                      // GET  /chats
api.agente.abrirConversa(id)                // GET  /chats/:id
api.agente.excluirConversa(id)              // DELETE /chats/:id
api.agente.reindexar()                      // POST /rag/reindex
```

Erros chegam como `erroApi` com `status`, `semLogin` (401) e `offline`. O `client` avisa a camada de cima: 401 chama `semLogin` (volta ao login), 403/429 chama `negado` (aviso na tela).

## Mock

`infrastructure/mock.js` implementa o mesmo contrato de transporte e as mesmas rotas do back, com o banco no `localStorage`. Liga com `?api=mock` na URL e desliga com `?api=http` (a escolha fica salva no navegador).

- Dados: `mock-dados.js`, **gerado** de `data/seed.json` e `backend/entities/perfis.js` por `npm run mock:dados`. Um teste falha se ficar desatualizado.
- Usuários de teste: os mesmos cinco perfis demo, senha `demo123`.
- Chat e análise respondem por regras simples (fonte `mock`), sem LLM.
- `resetarMock()` é exportado para testes.

## Telas × funcionalidades

| Aba | Tela | Controller | Requisito |
|---|---|---|---|
| Login | `screens/login.js` | `sessao` | perfis por setor |
| Dashboard | `screens/dashboard.js` | `dashboard` | RF05, RF01 |
| Estoque | `screens/estoque.js` | `estoque` | RF04, RF02 (reindexar) |
| Resíduos | `screens/residuos.js` | `estoque` | — |
| Agente IA | `screens/chat.js` | `chat` | RF03 |
| Auditoria | `screens/auditoria.js` | `auditoria` | RF06 |
| Topo | `screens/topo.js` | `status`, `sessao` | status do banco/vetor/LLM |

## O que é obrigatório testar

- Regra das camadas (`test/camadas.test.js`).
- Funções puras novas de controllers e entities (back em `test/backend/`, front em `test/front/`).
- Toda rota nova no back também no mock, com teste em `test/front/mock.test.mjs`.
- Fluxo ponta a ponta da API: `npm run smoke` (MongoDB em memória).
