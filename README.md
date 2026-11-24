# ReSource — Gestão Inteligente e Zero Waste com IA

![Node.js](https://img.shields.io/badge/Node.js-22-339933?logo=nodedotjs&logoColor=white)
![Express](https://img.shields.io/badge/Express-4-000000?logo=express&logoColor=white)
![MongoDB](https://img.shields.io/badge/MongoDB-Atlas-47A248?logo=mongodb&logoColor=white)
![Groq](https://img.shields.io/badge/IA-Groq-F55036)
![JavaScript](https://img.shields.io/badge/JavaScript-ES2022-F7DF1E?logo=javascript&logoColor=black)
![HTML5](https://img.shields.io/badge/HTML5-E34F26?logo=html5&logoColor=white)
![CSS3](https://img.shields.io/badge/CSS3-1572B6?logo=css3&logoColor=white)
![Vercel](https://img.shields.io/badge/Deploy-Vercel-000000?logo=vercel&logoColor=white)

Plataforma web de gestão de materiais e resíduos com foco em **Zero Waste**, que conecta o banco de
dados legado de uma indústria a um **agente de IA** capaz de responder perguntas sobre estoque,
resíduos e indicadores ambientais — com rastreabilidade completa de cada resposta.

Projeto desenvolvido como MVP para a avaliação A3, aplicado à empresa fictícia **EcoNova Indústria**.

**Demo:** https://a3-mvp-resource-backend.vercel.app

---

## Sumário

- [Visão geral](#visão-geral)
- [Funcionalidades](#funcionalidades)
- [Tecnologias](#tecnologias)
- [Arquitetura](#arquitetura)
- [Como executar](#como-executar)
- [Variáveis de ambiente](#variáveis-de-ambiente)
- [Acesso de demonstração](#acesso-de-demonstração)
- [API](#api)
- [Requisitos atendidos](#requisitos-atendidos)
- [Segurança](#segurança)
- [Estrutura do projeto](#estrutura-do-projeto)
- [Decisões técnicas](#decisões-técnicas)

---

## Visão geral

A EcoNova mantém o controle de materiais e resíduos em um banco legado e em planilhas, o que gera
três problemas:

1. **Dados sem acesso fácil** — as informações existem, mas apenas como tabelas e registros soltos.
2. **Relatórios ambientais manuais** — cada fechamento depende de filtragem manual, atrasando
   decisões e aumentando erros.
3. **Falta de rastreabilidade** — não há histórico de quais consultas foram feitas, por quem e com
   quais fontes.

O ReSource resolve esses pontos **sem reescrever o banco**: ele lê os dados do legado, indexa o
conteúdo para busca semântica e usa um agente de IA para explicar os resultados, registrando tudo em
auditoria.

## Funcionalidades

| Módulo | Descrição |
|---|---|
| **Dashboard** | Indicadores ambientais consolidados (massa residual, percentual recuperado, conformidade ESG) e relatório executivo gerado pelo agente de IA. |
| **Estoque** | CRUD completo de insumos, com validação de saldo no descarte. |
| **Resíduos** | Registro de resíduos por etapa de produção, com classificação e destinação. |
| **Agente IA** | Chat com RAG (*Retrieval-Augmented Generation*): cada pergunta busca os documentos mais relevantes do banco antes de ser enviada ao modelo. O histórico de conversas é persistido. |
| **Auditoria** | Registro de cada resposta do agente, com fontes utilizadas, tempo de resposta e identidade de quem executou. |
| **Controle de acesso** | Perfis por setor com permissões distintas, aplicadas no frontend e validadas no backend. |

## Tecnologias

| Camada | Tecnologia |
|---|---|
| **Frontend** | HTML5, CSS3 e JavaScript puro (SPA, mobile-first, sem framework) |
| **Backend** | Node.js 22 · Express 4 · API REST |
| **Banco de dados** | MongoDB Atlas (driver oficial `mongodb`) · modo simulado em arquivo JSON para desenvolvimento |
| **Busca semântica** | Índice vetorial próprio com TF-IDF e similaridade de cosseno (interface inspirada no Qdrant) |
| **Inteligência artificial** | Groq API (compatível com OpenAI) · modelo padrão `openai/gpt-oss-120b` |
| **Autenticação** | Sessão sem estado com token assinado por HMAC (`crypto` nativo do Node) |
| **Infraestrutura** | Vercel (Serverless Functions + CDN) |
| **Outras bibliotecas** | `cors`, `dotenv` |

## Arquitetura

```
navegador ──► CDN da Vercel ──► /            (SPA estática em public/)
                    │
                    └──► /api/* ──► Serverless Function (api/index.js → backend/app.js)
                                          │
                                          ├──► MongoDB Atlas   (materiais, resíduos, políticas,
                                          │                     conversas, auditoria)
                                          └──► Groq            (chat RAG e análise de estoque)
```

**MongoDB Atlas como fonte da verdade.** O banco é acessado por uma camada de coleções (`find`,
`insertOne`, `updateOne`, `deleteOne`) sem alterar o modelo original dos dados. O pool de conexões é
criado no *cold start* e reaproveitado entre requisições. O seed de demonstração (`data/seed.json`) é
aplicado apenas em coleções vazias, de forma idempotente.

**Busca vetorial local.** Materiais, resíduos e políticas são convertidos em vetores TF-IDF e
consultados por similaridade de cosseno. A interface de indexação e busca segue o modelo do Qdrant,
mas roda dentro da própria aplicação, sem serviço externo.

**Agente de IA desacoplado.** O módulo `backend/infrastructure/groq.js` é o único que fala com o LLM. Nenhuma rota de
dados depende dele: se a IA estiver indisponível, o CRUD segue funcionando e o agente responde por um
fallback determinístico, com o status exibido na interface.

### Camadas

Back e front seguem a mesma ideia: camadas com seta única, conferida por teste. Detalhes e contrato
completo em [`ARCHITECTURE.md`](ARCHITECTURE.md).

```
back:   routes → controllers → infrastructure   (entities: perfis e prompts)
front:  main.js → screens → controllers → infrastructure   (components/ui, entities, models)
```

O front tem dois transportes com o mesmo contrato: **HTTP** (API real) e **mock** (back falso no
navegador, com os mesmos dados e perfis). Com `?api=mock` na URL, a interface inteira funciona sem
servidor.

### Fluxo de uma pergunta ao agente

```
"Qual o destino dos resíduos perigosos?"
        │
        ├─► vetorização da pergunta (TF-IDF)
        ├─► busca por similaridade no índice (cosseno)
        ├─► recuperação dos materiais, resíduos e políticas mais relevantes
        ├─► montagem do prompt com contexto + histórico da conversa
        ├─► geração da resposta pelo Groq
        └─► resposta, fontes e auditoria persistidas no MongoDB
```

## Como executar

**Pré-requisitos:** Node.js 22 e npm. MongoDB Atlas e chave do Groq são opcionais em
desenvolvimento.

```bash
git clone <url-do-repositorio>
cd A3-MVP
npm install
cp .env.example .env    # preencha os valores necessários
npm run dev             # http://localhost:3000
```

| Comando | Descrição |
|---|---|
| `npm run dev` | Servidor local com reinício automático ao salvar |
| `npm start` | Servidor local sem *watch* |
| `npm test` | Testes unitários (back e front) e regra das camadas |
| `npm run smoke` | Teste ponta a ponta da API com MongoDB em memória (instale antes `npm i -D mongodb-memory-server --no-save`) |
| `npm run mock:dados` | Regenera os dados do mock do front a partir de `data/seed.json` |

Sem `MONGODB_URI`, a aplicação usa o banco simulado em `data/db.json`. Sem `GROQ_API_KEY`, o agente
responde pelo fallback local. Para usar só o front, sem back, abra `http://localhost:3000/?api=mock`
(volte com `?api=http`).

### Deploy

O projeto está configurado para a Vercel (`vercel.json`): os arquivos de `public/` são servidos pela
CDN e as rotas `/api/*` são encaminhadas para a Serverless Function em `api/index.js`.

```bash
vercel          # preview
vercel --prod   # produção
```

## Variáveis de ambiente

O modelo completo está em [`.env.example`](.env.example).

| Variável | Descrição |
|---|---|
| `MONGODB_URI`, `MONGODB_DB` | Conexão com o MongoDB Atlas. Sem URI, usa o modo simulado. |
| `GROQ_API_KEY`, `GROQ_MODEL` | Credencial e modelo do agente de IA. |
| `SESSION_SECRET`, `SESSION_TTL_HOURS` | Segredo de assinatura e validade da sessão (padrão: 12 h). |
| `ADMIN_TOKEN` | Token exigido por `POST /api/reset` em produção. |
| `RATE_LIMIT`, `RATE_LIMIT_CHAT`, `RATE_LIMIT_ANALISE`, `RATE_LIMIT_LOGIN` | Limite de requisições por IP por minuto. |
| `PORT` | Porta do servidor local (padrão: 3000). |

## Acesso de demonstração

Os perfis abaixo são **fictícios** e exibidos na própria tela de login. Cada um reproduz as
permissões de um setor:

| Perfil | E-mail | Senha | Permissões |
|---|---|---|---|
| Gestor Ambiental | `gestor@econova.com` | `demo123` | Visão completa: estoque, resíduos, relatórios, auditoria e reindexação |
| Operador de Estoque | `estoque@econova.com` | `demo123` | Cadastro, edição e exclusão de materiais |
| Analista de Resíduos | `residuos@econova.com` | `demo123` | Registro de resíduos e consultas |
| Auditor | `auditor@econova.com` | `demo123` | Somente leitura: dashboard, relatórios e auditoria |
| Administrador | `admin@econova.com` | `demo123` | Acesso total e restauração da demo |

> **Atenção:** este modelo de autenticação é apenas para demonstração. Em produção, os perfis de `backend/entities/perfis.js`
> devem ser substituídos por um provedor de identidade (Auth0, Clerk, Cognito etc.), mantendo a
> interface `req.user` + `permissions`.

## API

Todas as rotas exigem `Authorization: Bearer <token>` (obtido em `POST /api/auth/login`), exceto
`GET /api/health`, `POST /api/auth/login` e `GET /api/auth/demo-users`. Rotas de escrita também
validam a permissão do perfil.

| Método e rota | Descrição |
|---|---|
| `POST /api/auth/login` | Autentica um perfil e devolve o token de sessão |
| `GET /api/auth/demo-users` | Lista os perfis de demonstração |
| `GET /api/auth/me` · `POST /api/auth/logout` | Perfil da sessão atual / encerramento |
| `GET /api/health` | Status do banco, do índice vetorial e do LLM |
| `GET` `POST` `PUT` `DELETE /api/materiais` | CRUD de insumos |
| `GET` `POST /api/residuos` | Resíduos e destinações |
| `GET /api/dashboard` | Indicadores ambientais |
| `POST /api/chat` | Consulta RAG ao agente de IA |
| `GET` `POST /api/chats` · `GET` `DELETE /api/chats/:id` | Histórico de conversas |
| `POST /api/estoque/analise` | Relatório executivo do agente |
| `POST /api/rag/reindex` · `GET /api/rag/search?q=` | Indexação e busca vetorial |
| `GET /api/auditorias` | Histórico de ações do agente |
| `POST /api/auditorias/excluir` | Exclui os registros escolhidos (admin + token em produção) |
| `POST /api/reset` | Restaura os dados de demonstração (admin + token em produção) |

## Requisitos atendidos

| ID | Requisito | Implementação |
|----|-----------|---------------|
| RF01 | Análise de estoque com agente IA | Dashboard → "Analisar com IA" (`POST /api/estoque/analise`) |
| RF02 | Vetorização e indexação dos dados | `POST /api/rag/reindex`, `GET /api/rag/search` |
| RF03 | Consultor RAG (chat) | Módulo Agente IA (`POST /api/chat`) |
| RF04 | Gestão de materiais (CRUD) | Módulo Estoque |
| RF05 | Dashboard de indicadores | `GET /api/dashboard` |
| RF06 | Auditoria e rastreabilidade | `GET /api/auditorias` |
| RNF01 | Integração não invasiva | A API apenas lê o banco legado, sem alterar o modelo original |
| RNF02 | Resposta em até 3 s | Busca vetorial local (< 50 ms); latência do LLM exibida na interface |
| RNF03 | API desacoplada da IA | Rotas de dados independem de `groq.js`; chat e análise têm fallback |
| RNF04 | Interface responsiva | CSS mobile-first |

## Segurança

- **Sessão assinada:** token HMAC sem estado (compatível com serverless), verificado em tempo
  constante. Em produção, defina `SESSION_SECRET` com um valor aleatório e longo.
- **Permissões por setor:** rotas de escrita checam permissões declarativas (`materiais:write`,
  `residuos:write`, `rag:reindex`, `auditoria:delete`, `demo:reset`). O backend responde **403** mesmo se a API for
  chamada diretamente.
- **Conversas isoladas:** cada conversa pertence ao perfil que a criou; apenas o administrador pode
  auditar todas.
- **Auditoria com identidade:** cada evento registra nome, e-mail, setor, perfil e data.
- **Reset e exclusão de auditoria protegidos:** exigem perfil administrador e, em produção, o
  header `x-admin-token`, comparado com `timingSafeEqual`.
- **Rate limiting por IP:** limites configuráveis para chat, análise e login.
- **Segredos fora do repositório:** `.env` é ignorado pelo Git e pelo deploy.

## Estrutura do projeto

```
A3-MVP/
├── api/index.js                 # entrypoint da Serverless Function (Vercel)
├── backend/
│   ├── app.js                   # monta o Express e exporta o app
│   ├── server.js                # servidor de desenvolvimento
│   ├── routes/index.js          # URL → guardas → controller
│   ├── controllers/             # regra por recurso + guardas (sessão, permissão, rate limit)
│   ├── infrastructure/          # config, db, vetores (TF-IDF), groq, sessão HMAC, auditoria
│   └── entities/                # perfis demo e prompts do agente
├── public/
│   ├── index.html
│   ├── css/                     # tema.css (tokens) e style.css
│   └── js/
│       ├── main.js              # entrada: abas e login × plataforma
│       ├── screens/             # uma tela por aba
│       ├── controllers/         # estado e regra das telas
│       ├── infrastructure/      # transporte http e mock, client, sessão, recursos/
│       ├── components/ui/       # peças sem regra
│       ├── entities/            # catálogo e permissões
│       └── models/              # tipos da API (JSDoc)
├── data/seed.json               # dados de demonstração
├── test/                        # testes (back, front e regra das camadas)
├── scripts/                     # smoke test e gerador do mock
├── AGENTS.md · ARCHITECTURE.md · LAYOUT.md · docs/VISUAL.md
├── vercel.json
└── package.json
```

## Decisões técnicas

- **Arquivos estáticos em `public/`:** a Vercel serve estáticos pela CDN, sem passar pelo
  `express.static()`.
- **MongoDB obrigatório em produção:** o sistema de arquivos da função é somente leitura; o modo
  simulado existe apenas para desenvolvimento e como degradação segura.
- **Degradação em camadas:** sem banco, o app responde com o seed em memória; sem LLM, com o
  fallback. O `GET /api/health` expõe os dois estados (`mongo.degraded`, `llm.available`) para que a
  interface sempre reflita a situação real.
- **Mock no front:** o mock implementa as mesmas rotas do back e usa os mesmos dados, gerados de
  `data/seed.json`. Serve para demonstrar sem servidor e para testar o front de forma previsível.
- **Cold start do LLM:** o health check do Groq é cacheado por 15 s e o chat não faz verificação
  prévia, evitando que uma conexão lenta em instâncias novas force o fallback sem necessidade.
