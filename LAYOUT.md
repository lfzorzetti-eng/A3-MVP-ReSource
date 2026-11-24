# Layout

Valores tirados de `public/css/style.css`. Mudou o CSS, muda aqui.

## Régua

| Nome | Largura | O que muda |
|---|---|---|
| desktop | > 900px | login em duas colunas (apresentação + painel) |
| tablet | 821–900px | login em uma coluna |
| tablet estreito | 641–820px | dashboard e chat viram uma coluna |
| celular | ≤ 640px | formulários em uma coluna, mensagens do chat em largura total, topo compacto |

- Conteúdo centralizado com largura máxima de **1100px** e margem lateral de **20px**.
- Espaço entre blocos: 14–18px. Raio padrão: `--radius` (14px).

## Grades

| Bloco | Desktop | ≤ 820px | ≤ 640px |
|---|---|---|---|
| KPIs (`.kpis`) | colunas automáticas de no mínimo 170px | idem | idem |
| `.grid-2` (dashboard) | 2 colunas | 1 coluna | 1 coluna |
| Cartões de resíduo | colunas automáticas de no mínimo 250px | idem | idem |
| `.form-grid` | 2 colunas (`.span2` ocupa as duas) | 2 colunas | 1 coluna |
| Chat (`.chat-layout`) | lista 250px + conversa | 1 coluna (lista em cima) | 1 coluna |
| Barras de resíduo | rótulo 92px · barra · valor 60px | idem | idem |

## Por tela

| Tela | Seções, de cima para baixo |
|---|---|
| Login | apresentação dos perfis · painel com formulário · cartões de perfil demo |
| Dashboard | cabeçalho com empresa · KPIs · resíduos por categoria + últimas movimentações · relatório com IA |
| Estoque | cabeçalho · filtros (busca, categoria, reindexar) · tabela de materiais · formulário (oculto) |
| Resíduos | cabeçalho · cartões de resíduo · formulário (oculto) |
| Agente IA | cabeçalho com status do LLM · lista de conversas · mensagens · sugestões · campo de envio |
| Auditoria | cabeçalho com excluir selecionados (só admin) · tabela de eventos com seleção (só admin) · botão de restaurar a demo (só admin) |
