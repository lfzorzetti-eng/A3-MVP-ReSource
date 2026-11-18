/**
 * Configuração lida do ambiente. Único lugar do back que lê process.env.
 *
 * O .env local é carregado aqui, antes de qualquer leitura. Na Vercel as
 * variáveis vêm do painel (dotenv não sobrescreve o que já existe).
 */

require('dotenv').config({ quiet: true });

const env = process.env;
const texto = (nome, padrao = '') => String(env[nome] ?? padrao).trim();
const numero = (nome, padrao) => Number(env[nome] || padrao);

module.exports = {
  PORT: numero('PORT', 3000),

  // banco
  MONGO_URI: texto('MONGODB_URI'),
  MONGO_DB: texto('MONGODB_DB', 'resource_mvp'),
  MONGO_RETRIES: numero('MONGODB_RETRIES', 3),

  // agente de IA
  GROQ_URL: texto('GROQ_URL', 'https://api.groq.com/openai/v1').replace(/\/+$/, ''),
  GROQ_MODEL: texto('GROQ_MODEL', 'openai/gpt-oss-120b'),
  GROQ_API_KEY: texto('GROQ_API_KEY'),
  GROQ_HEALTH_TTL_MS: numero('GROQ_HEALTH_TTL_MS', 15000),

  // sessão e operação
  ADMIN_TOKEN: texto('ADMIN_TOKEN'),
  SESSION_SECRET: texto('SESSION_SECRET'),
  SESSION_TTL_HOURS: numero('SESSION_TTL_HOURS', 12),

  // rate limit por IP (por minuto); ausente ou "off" desliga
  RATE_LIMIT_ATIVO: !!env.RATE_LIMIT && env.RATE_LIMIT !== 'off',
  RATE_LIMIT_CHAT: numero('RATE_LIMIT_CHAT', 20),
  RATE_LIMIT_ANALISE: numero('RATE_LIMIT_ANALISE', 10),
  RATE_LIMIT_LOGIN: numero('RATE_LIMIT_LOGIN', 20),
};
