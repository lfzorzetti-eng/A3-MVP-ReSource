# Guia visual

## Ideia

Painel de operação industrial com cara de ferramenta, não de propaganda: fundo escuro, uma cor de marca (verde-água) e cores de alerta só onde há risco.

## Cores (`public/css/tema.css`)

| Token | Valor | Uso |
|---|---|---|
| `--bg` | `#0b1211` | fundo da página |
| `--surface` / `--surface-2` | `#121c1b` / `#0f1918` | cartões, tabelas, campos |
| `--ink` | `#e6efed` | texto principal |
| `--muted` | `#92a5a2` | texto secundário (`.sub`, dicas) |
| `--line` | `#22312f` | bordas e divisórias |
| `--brand` / `--brand-dark` / `--brand-text` / `--brand-soft` | verde-água | botão principal, foco, links, fundo de destaque |
| `--accent` | `#22c55e` | final do gradiente das barras, status "on" |
| `--warn` | `#f59e0b` | risco médio, KPI de atenção |
| `--danger` | `#ef4444` | risco alto, resíduo perigoso, excluir |

Cada perfil tem uma cor própria (`.role-gestor`, `.role-estoque`, `.role-residuos`, `.role-auditor`, `.role-admin`), usada só no avatar, no selo e no cartão de login.

## Tipografia

Inter (400 a 800). Títulos de tela em 24px; texto de apoio (`.sub`) em 13,5px; textos menores com `.sub-sm` (12px) e `.sub-xs` (11px).

## Forma e movimento

- Raio de 14px em cartões; pílulas e tags totalmente arredondadas.
- Transições curtas (0,15s) em botões; troca de aba com fade de 0,25s; barras crescem em 0,6s.
- Indicador de digitação do agente: três pontos piscando.

## Comunicação

- Português, frases curtas. Erro diz o que aconteceu e o que fazer ("Sessão expirada. Entre novamente.").
- Toda resposta do agente mostra a fonte (Groq, fallback ou mock), o tempo e os documentos usados.

## O que não entra

- Cor ou tamanho escrito direto no JS ou no HTML (`style="..."`). A única exceção é a largura das barras, que vem do dado.
- Cor nova fora de `tema.css` e das cores de perfil.
- Gradiente além do topo e das barras de resíduo.
- Emoji na interface.
