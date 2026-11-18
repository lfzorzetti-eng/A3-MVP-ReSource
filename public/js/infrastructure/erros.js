/** Erro padrão da API e tradução para frase de tela. */

/**
 * @param {string} mensagem
 * @param {{status?:number, semLogin?:boolean, offline?:boolean}} [extra]
 */
export function erroApi(mensagem, { status = 0, semLogin = false, offline = false } = {}) {
  const e = new Error(mensagem);
  e.status = status;
  e.semLogin = semLogin;
  e.offline = offline;
  return e;
}

/** Mensagem pronta para mostrar ao usuário. */
export function mensagemErro(e, padrao = 'Algo deu errado. Tente de novo.') {
  if (!e) return padrao;
  if (e.offline) return 'Sem conexão com o servidor. Verifique a internet e tente de novo.';
  return e.message || padrao;
}
