/** Dados fixos da interface. Fonte única das opções dos formulários e das constantes de tela. */

const congelar = (obj) => Object.freeze(obj);

export const CATEGORIAS = congelar(['Plástico', 'Papel', 'Metal', 'Químico', 'Orgânico', 'Vidro']);
export const RISCOS = congelar(['Baixo', 'Médio', 'Alto']);
export const CLASSES_RESIDUO = congelar(['Não perigoso', 'Perigoso - classe I']);

/** Qual lista preenche cada `<select data-opcoes="...">` do HTML. */
export const OPCOES = congelar({ categorias: CATEGORIAS, riscos: RISCOS, classes: CLASSES_RESIDUO });

/** Campos editáveis de um material (mesma lista do back). */
export const CAMPOS_MATERIAL = congelar(['nome', 'categoria', 'unidade', 'saldo', 'custo_unitario', 'fornecedor', 'localizacao', 'risco', 'descricao']);

/** Intervalo de atualização das pílulas de status. */
export const STATUS_INTERVALO_MS = 30000;

/** Espera da busca de materiais enquanto a pessoa digita. */
export const BUSCA_ESPERA_MS = 250;
