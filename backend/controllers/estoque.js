/** Dados da empresa, materiais (RF04), resíduos e movimentações. */

const db = require('../infrastructure/db');
const vetores = require('../infrastructure/vetores');
const auditoria = require('../infrastructure/auditoria');

const CAMPOS_MATERIAL = ['nome', 'categoria', 'unidade', 'saldo', 'custo_unitario', 'fornecedor', 'localizacao', 'risco', 'descricao'];

// ------------------------------------------------------------ empresa

const empresa = async (req, res) => res.json(await db.config('empresa'));
const indicadores = async (req, res) => res.json(await db.config('indicadores'));
const politicas = async (req, res) => res.json(await db.collection('politicas').all());

// ------------------------------------------------------------ materiais

/** Filtro da listagem: categoria exata e busca livre em nome, código e descrição. */
function filtrarMateriais(rows, { categoria, q } = {}) {
  let out = rows;
  if (categoria) out = out.filter((r) => r.categoria.toLowerCase() === categoria.toLowerCase());
  if (q) out = out.filter((r) => `${r.nome} ${r.codigo} ${r.descricao}`.toLowerCase().includes(q.toLowerCase()));
  return out;
}

async function listarMateriais(req, res) {
  res.json(filtrarMateriais(await db.collection('materiais').all(), req.query));
}

async function criarMaterial(req, res) {
  const { nome, categoria, unidade, saldo, custo_unitario, fornecedor, localizacao, risco, descricao } = req.body || {};
  if (!nome || !categoria) return res.status(400).json({ error: 'nome e categoria são obrigatórios' });
  const total = await db.collection('materiais').count();
  const doc = await db.collection('materiais').insertOne({
    codigo: `INS-${String(total + 1).padStart(3, '0')}`,
    nome, categoria, unidade: unidade || 'un', saldo: Number(saldo) || 0,
    custo_unitario: Number(custo_unitario) || 0, fornecedor: fornecedor || '',
    localizacao: localizacao || '', risco: risco || 'Baixo', descricao: descricao || '',
  });
  await vetores.rebuild();
  await auditoria.registrar('Cadastro de material', `Novo material ${doc.codigo} - ${nome}`, req.user);
  res.status(201).json(doc);
}

async function atualizarMaterial(req, res) {
  const $set = {};
  for (const k of CAMPOS_MATERIAL) if (req.body[k] !== undefined) $set[k] = req.body[k];
  const doc = await db.collection('materiais').updateOne({ _id: req.params.id }, { $set });
  if (!doc) return res.status(404).json({ error: 'material não encontrado' });
  await vetores.rebuild();
  await auditoria.registrar('Atualização de material', `${doc.codigo} atualizado`, req.user);
  res.json(doc);
}

async function excluirMaterial(req, res) {
  const ok = await db.collection('materiais').deleteOne({ _id: req.params.id });
  if (!ok) return res.status(404).json({ error: 'material não encontrado' });
  await vetores.rebuild();
  await auditoria.registrar('Exclusão de material', `id ${req.params.id}`, req.user);
  res.json({ ok: true });
}

// ------------------------------------------------------------ resíduos

const listarResiduos = async (req, res) => res.json(await db.collection('residuos').all());

async function criarResiduo(req, res) {
  const { nome, categoria, quantidade_kg, classe, destino_atual, fornecedor_destino } = req.body || {};
  if (!nome) return res.status(400).json({ error: 'nome é obrigatório' });
  const doc = await db.collection('residuos').insertOne({
    nome, categoria: categoria || 'Geral', quantidade_kg: Number(quantidade_kg) || 0,
    classe: classe || 'Não perigoso', destino_atual: destino_atual || 'Triagem pendente',
    gerado_em: new Date().toISOString().slice(0, 10), fornecedor_destino: fornecedor_destino || '',
  });
  await vetores.rebuild();
  await auditoria.registrar('Registro de resíduo', `${nome} (${doc.quantidade_kg} kg)`, req.user);
  res.status(201).json(doc);
}

// ------------------------------------------------------------ movimentações

async function listarMovimentacoes(req, res) {
  const materiais = await db.collection('materiais').all();
  const porId = new Map(materiais.map((m) => [m._id, m]));
  const rows = (await db.collection('movimentacoes').all()).map((mv) => {
    const mat = porId.get(mv.material_id);
    return { ...mv, material_nome: mat?.nome || '—', material_codigo: mat?.codigo || '—' };
  });
  res.json(rows.sort((a, b) => b.data.localeCompare(a.data)));
}

module.exports = {
  empresa, indicadores, politicas,
  filtrarMateriais, listarMateriais, criarMaterial, atualizarMaterial, excluirMaterial,
  listarResiduos, criarResiduo, listarMovimentacoes,
};
