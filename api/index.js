/**
 * Entrypoint da serverless function do Vercel.
 * O Vercel empacota este arquivo e o expõe em /api (vercel.json faz o
 * rewrite de /api/* para cá). A app Express é a mesma usada no servidor local.
 */

const { app } = require('../backend/app');

module.exports = app;
