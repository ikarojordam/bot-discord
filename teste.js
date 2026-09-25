require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');

console.log('🔵 [TESTE] Iniciando...');
console.log('🔵 [TESTE] Token tem', (process.env.DISCORD_TOKEN || '').length, 'caracteres');
console.log('🔵 [TESTE] Token começa com:', (process.env.DISCORD_TOKEN || '').substring(0, 15) + '...');
console.log('🔵 [TESTE] Token termina com:', '...' + (process.env.DISCORD_TOKEN || '').slice(-10));
console.log('🔵 [TESTE] Token tem espaço?', /\s/.test(process.env.DISCORD_TOKEN || ''));
console.log('🔵 [TESTE] Token tem quebra?', /[\r\n]/.test(process.env.DISCORD_TOKEN || ''));

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
});

client.on('debug', (msg) => console.log('[DEBUG-WS]', msg.substring(0, 250)));
client.on('raw', (p) => console.log('[RAW]', p.t));
client.on('error', (e) => console.error('❌ [ERROR]', e.message, e.code));
client.on('shardError', (e) => console.error('❌ [SHARD-ERR]', e.message, e.code));
client.on('shardDisconnect', (e, id) => console.error('❌ [DISCONNECT]', id, 'code=', e?.code, 'reason=', e?.reason));
client.on('warn', (m) => console.warn('⚠️ [WARN]', m));
client.on('ready', () => {
  console.log('✅✅✅ [TESTE] BOT ONLINE! ✅✅✅');
  console.log('Tag:', client.user.tag);
  console.log('Guilds:', client.guilds.cache.size);
});

client.login(process.env.DISCORD_TOKEN)
  .then(() => console.log('🔵 [TESTE] Promise resolvida'))
  .catch(e => {
    console.error('❌❌❌ [TESTE] LOGIN FALHOU');
    console.error('Message:', e.message);
    console.error('Code:', e.code);
  });
