# ReSource — Gestão Inteligente e Zero Waste com IA

MVP web da plataforma **ReSource**, construído sobre os checkpoints 1 e 2 da A3.

**🌐 Demo ao vivo:** https://a3-mvp-resource-backend.vercel.app
**📊 Apresentação do projeto:** https://a3-mvp-resource-backend.vercel.app/apresentacao

O sistema conecta o **banco de dados legado** de uma indústria fictícia (EcoNova Indústria) a um
**agente de IA** que responde perguntas sobre materiais, resíduos e indicadores ambientais, com
rastreabilidade de auditoria.

---

## O problema

A EcoNova Industria tem hoje o controle de materiais e resíduos espalhado em um banco legado e em
planilhas. Isso gera três problemas concretos:

1. **Ninguém consegue perguntar "onde está o que sobra?"** — os dados existem, mas só em forma de
   tabelas e registros soltos.
2. **O relatório ambiental é manual** — cada fechamento exige someone filtrando registros à mão,
   o que atrasa a decisão e aumenta o erro.
3. **Não há rastreabilidade** — não existe histórico de qual consulta do agente foi feita, com qual
   fonte e por quem.

O ReSource resolve os três sem reescrever o banco: ele **lê** o legado, **indexa** vetorialmente e
**explica** o resultado com um agente de IA.

## O que o MVP entrega

| Aba | O que faz |
|---|---|
| **Dashboard** | Indicadores ambientais consolidados: massa residual, percentual recuperado e conformidade ESG. Inclui botão "Analisar com IA" que gera um relatório executivo do agente. |
| **Estoque** | CRUD completo de insumos (materiais): cadastro, edição, consulta e descarte com validação de saldo. |
| **Resíduos** | Resíduos gerados por etapa de produção, com classificação, destinação e rastreabilidade. |
| **Agente IA** | Chat RAG: cada pergunta é embedada, recupera os documentos relevantes do banco e monta o contexto para o LLM. O histórico de conversas é persistido. |
| **Auditoria** | Registro de tudo que o agente respondeu, com as fontes usadas e o tempo de resposta. |

Além do chat, existem páginas de **apresentação** do projeto e de **API** (documentação viva dos
endpoints, gerada a partir do próprio backend).

## Como funciona

```
navegador ──► CDN da Vercel ──► /            (SPA estática em public/)
                    │
                    └──► /api/* ──► serverless function (api/index.js → backend/app.js)
                                          │
                                          ├──► MongoDB Atlas   (materiais, resíduos, políticas,
                                          │                     conversas, auditoria)
                                          └──► Ollama Cloud    (chat RAG e análise de estoque)
```

Três peças trabalham juntas:

**1. MongoDB Atlas como fonte da verdade.**
O banco legado da empresa é consumido por uma API no estilo coleções (`find`, `insertOne`,
`updateOne`, `deleteOne`), sem alterar o modelo original dos dados. Na produção roda em **MongoDB
Atlas** (driver oficial); o pool de conexões é criado no cold start da função e reaproveitado entre
requisições. O seed de demonstração (`data/seed.json` — 12 materiais, 8 resíduos, 4 políticas) é
aplicado automaticamente nas coleções vazias e é **idempotente**, então redeployar nunca duplica
dados.

**2. Banco vetorial simulado (mimic do Qdrant).**
Cada material, resíduo e política vira um documento vetorizado por **TF-IDF** local, com
similaridade de **cosseno** na busca. É um mimic deliberado do Qdrant: a mesma interface de
indexação/rebusca, sem depender de um serviço extra — o que mantém o MVP auto-contido.

**3. Ollama como agente de IA.**
O `backend/ollama.js` fala com a API do Ollama (mesmo protocolo para a instalação local e para o
**Ollama Cloud**), usando `Authorization: Bearer` na cloud. O modelo em produção é o
**`gemma4:31b-cloud`**. O app é desacoplado da IA: se o LLM estiver indisponível, as respostas de
dados continuam funcionando e o agente responde por um fallback determinístico, com o status
exibido na interface (`GET /api/health` reporta `ollama.available`).

O `backend/app.js` é a **API desacoplada da IA** (RF03): nenhuma rota de CRUD depende do módulo
de LLM para entregar dados.

### Ciclo de uma pergunta do Agente IA

```
"Qual o destino dos resíduos perigosos?"
        │
        ├─► vetorização da pergunta (TF-IDF)
        ├─► busca de similaridade no índice (cosseno)
        ├─► contexto recuperado: materiais, resíduos e políticas mais relevantes
        ├─► prompt montado com o contexto + histórico da conversa
        ├─► Ollama Cloud (gemma4:31b-cloud) gera a resposta
        └─► resposta + fontes + auditoria persistidas no Atlas
```

## Requisitos atendidos

| ID | Requisito | Onde |
|----|-----------|------|
| RF01 | Análise de estoque com agente IA | Dashboard → "Analisar com IA" (`POST /api/estoque/analise`) |
| RF02 | Vetorização: leitura do MongoDB e indexação | `POST /api/rag/reindex`, busca em `GET /api/rag/search` |
| RF03 | Consultor RAG (chat) | Aba "Agente IA" (`POST /api/chat`) |
| RF04 | Gestão de materiais (CRUD) | Aba "Estoque" |
| RF05 | Dashboard de indicadores | Aba "Dashboard" (`GET /api/dashboard`) |
| RF06 | Auditoria / rastreabilidade | Aba "Auditoria" (`GET /api/auditorias`) |
| RNF01 | Integração não invasiva | A API apenas lê/simula o banco legado, não altera o modelo original |
| RNF02 | Resposta em até 3s | Busca vetorial é local (<50 ms); latência do LLM exibida na UI |
| RNF03 | API Node.js desacoplada da IA | `app.js` não depende de `ollama.js` para dados; chat/análise degradam com fallback |
| RNF04 | Interface responsiva | CSS mobile-first |

## API

| Método & rota | Descrição |
|---|---|
| `GET /api/health` | Status do banco (real ou simulado), do índice vetorial e do Ollama |
| `GET\|POST\|PUT\|DELETE /api/materiais` | CRUD de insumos (RF04) |
| `GET\|POST /api/residuos` | Resíduos e destinos |
| `GET /api/dashboard` | Indicadores ambientais (RF05) |
| `POST /api/chat` | Consultor RAG (RF03): recupera contexto por similaridade → envia ao Ollama → persiste a conversa |
| `GET\|POST /api/chats`, `GET\|DELETE /api/chats/:id` | Histórico de conversas do Agente IA |
| `POST /api/estoque/analise` | Relatório executivo do agente (RF01) |
| `POST /api/rag/reindex`, `GET /api/rag/search?q=` | Vetorização e busca (RF02) |
| `GET /api/auditorias` | Histórico do agente (RF06) |
| `POST /api/reset` | Restaura os dados de demonstração |

## Segurança e operação

- **`POST /api/reset` exige token**: o header `x-admin-token` é comparado em tempo constante
  (`timingSafeEqual`). Sem o token correto a resposta é **403** — ninguém consegue resetar a demo
  pela internet.
- **Rate limiting por IP**: 20 requisições de chat e 10 de análise por minuto.
- **Segredos fora do repositório**: `.env` é ignorado pelo Git e pelo deploy; no bundle enviado à
  Vercel há apenas `.env.example` com placeholders.
- **Sem credenciais no frontend**: o token de admin fica em `sessionStorage` no navegador e é
  enviado apenas no header da requisição de reset.

## Estrutura do código

```
A3-MVP/
├── api/index.js        # entrypoint da serverless function do Vercel
├── backend/
│   ├── app.js           # API Express (RF01–RF06) — exporta o app
│   ├── server.js        # servidor Node (usado no desenvolvimento)
│   ├── db.js            # camada de dados: MongoDB (Atlas) ou simulado em arquivo
│   ├── vectorstore.js   # banco vetorial TF-IDF + cosseno (mimic Qdrant)
│   └── ollama.js        # cliente do agente IA (local ou cloud) + fallback
├── public/             # SPA estática (Dashboard, Estoque, Resíduos, Agente IA, Auditoria)
├── data/
│   ├── seed.json        # dados da empresa (12 materiais, 8 resíduos, políticas…)
│   └── db.json          # banco simulado local (gerado na 1ª execução, fora do git)
├── scripts/smoke-test.js  # teste ponta a ponta da API
├── vercel.json
└── package.json
```

## Decisões técnicas

- **Estáticos em `public/`**: a Vercel não executa `express.static()`; arquivos estáticos precisam
  ficar na pasta `public/` para serem servidos pela CDN.
- **MongoDB é obrigatório em produção**: o filesystem da função é somente leitura, então a
  persistência real (materiais, conversas, auditoria) depende do Atlas. O modo simulado em arquivo
  existe apenas para desenvolvimento e como degradação segura.
- **Degradação em camadas**: sem Atlas o app continua respondendo com o seed em memória; sem LLM o
  agente responde pelo fallback. O `GET /api/health` expõe os dois estados (`mongo.degraded`,
  `ollama.available`) para que a interface nunca finja que está tudo saudável.
- **Cold start do Ollama**: o health check do LLM é cacheado (15 s) e o chat **não** faz um
  pre-flight, porque o handshake TLS do `ollama.com` pode estourar o timeout em instâncias novas e
  degradar uma resposta que funcionaria.

## Stack

| Camada | Tecnologia |
|---|---|
| Frontend | HTML, CSS e JavaScript puros (SPA, mobile-first), sem framework |
| Backend | Node.js 22 · Express · API REST em `/api/*` |
| Banco | MongoDB Atlas (driver oficial) · modo simulado em arquivo para dev |
| Vetores | TF-IDF + similaridade de cosseno (mimic do Qdrant) |
| IA | Ollama Cloud — modelo `gemma4:31b-cloud` |
| Infra | Vercel (serverless functions + CDN) |
