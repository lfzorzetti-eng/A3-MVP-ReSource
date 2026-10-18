# ReSource — MVP (A3)

MVP web da plataforma **ReSource: Gestão Inteligente e Zero Waste com IA**, baseado nos checkpoints 1 e 2 da A3.

- **MongoDB simulado**: banco de dados legado da empresa (EcoNova Indústria) — materiais, resíduos, movimentações, políticas e auditorias — com API estilo coleções (`find/insertOne/updateOne/deleteOne`) persistida em `data/db.json`.
- **Ollama como agente de IA**: consultor RAG e análise de estoque via `llama3.2` (ou outro modelo local), com fallback determinístico caso o Ollama esteja offline.
- **Banco vetorial simulado (mimic do Qdrant)**: embeddings TF-IDF locais + similaridade de cosseno para o RAG.

## Requisitos atendidos

| ID | Requisito | Onde |
|----|-----------|------|
| RF01 | Análise de estoque com agente IA | Dashboard → "Analisar com IA" (`POST /api/estoque/analise`) |
| RF02 | Vetorização: leitura do MongoDB e indexação | `POST /api/rag/reindex`, busca em `GET /api/rag/search` |
| RF03 | Consultor RAG (chat) | Aba "Agente IA" (`POST /api/chat`) |
| RF04 | Gestão de materiais (CRUD) | Aba "Estoque" |
| RF05 | Dashboard de indicadores | Aba "Dashboard" (`GET /api/dashboard`) |
| RF06 | Auditoria / rastreabilidade | Aba "Auditoria" (`GET /api/auditorias`) |
| RNF01 | Integração não invasiva | API apenas lê/simula o banco legado, não altera o modelo original |
| RNF02 | Resposta em até 3s | Busca vetorial é local (<50ms); latência do LLM exibida na UI |
| RNF03 | API Node.js desacoplada da IA | `server.js` não depende de `ollama.js` para dados; chat/análise degradam com fallback |
| RNF04 | Interface responsiva | CSS mobile-first |

## Como rodar

```bash
cd backend
npm install
npm start
```

Abra **http://localhost:3000**

### Ollama (agente de IA)

```bash
ollama serve            # se não estiver rodando
ollama pull llama3.2    # modelo padrão
```

Variáveis opcionais: `OLLAMA_URL` (padrão `http://localhost:11434`), `OLLAMA_MODEL` (padrão `llama3.2`), `PORT` (padrão `3000`).

Sem Ollama o site continua funcionando: o agente responde por um fallback local e a UI indica "Ollama offline".

## Estrutura

```
A3-MVP/
├── backend/
│   ├── server.js        # API Express (RF01–RF06)
│   ├── db.js            # MongoDB simulado (persistência JSON)
│   ├── vectorstore.js   # banco vetorial TF-IDF + cosseno (mimic Qdrant)
│   └── ollama.js        # cliente do agente IA + fallback
├── data/
│   ├── seed.json        # dados da empresa (12 materiais, 8 resíduos, políticas…)
│   └── db.json          # criado automaticamente na 1ª execução
└── frontend/            # SPA estática (Dashboard, Estoque, Resíduos, Agente IA, Auditoria)
```

## Endpoints principais

- `GET /api/health` — status do Mongo simulado, índice vetorial e Ollama
- `GET|POST|PUT|DELETE /api/materiais` — CRUD de insumos (RF04)
- `GET|POST /api/residuos` — resíduos e destinações
- `GET /api/dashboard` — indicadores ambientais (RF05)
- `POST /api/chat` — consultor RAG (RF03): recupera contexto por similaridade → envia ao Ollama e persiste a conversa
- `GET|POST /api/chats` / `GET|DELETE /api/chats/:id` — histórico de conversas do Agente IA (criar, abrir e excluir chats)
- `POST /api/estoque/analise` — relatório executivo do agente (RF01)
- `POST /api/rag/reindex` / `GET /api/rag/search?q=` — vetorização (RF02)
- `GET /api/auditorias` — histórico do agente (RF06)
- `POST /api/reset` — restaura os dados de demonstração
# A3-MVP-ReSource
