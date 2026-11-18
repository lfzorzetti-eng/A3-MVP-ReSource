/**
 * Grava eventos de auditoria (RF06) com a identidade de quem praticou.
 * Falha de gravação nunca derruba a requisição: só vira aviso no log.
 */

const db = require('./db');

/**
 * `usuario` pode ser o req.user (perfil autenticado) ou uma string para
 * eventos de sistema.
 */
async function registrar(evento, detalhe, usuario = null) {
  try {
    const doc = {
      evento,
      detalhe,
      data: new Date().toISOString(),
      usuario: typeof usuario === 'string'
        ? usuario
        : (usuario?.name || usuario?.email || 'sistema'),
    };
    if (usuario && typeof usuario === 'object') {
      doc.usuario_email = usuario.email;
      doc.usuario_setor = usuario.sector;
      doc.usuario_role = usuario.role;
    }
    await db.collection('auditorias').insertOne(doc);
  } catch (e) {
    console.warn('[auditoria]', e.message);
  }
}

module.exports = { registrar };
