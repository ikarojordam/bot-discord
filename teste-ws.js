// ═══════════════════════════════════════════════════════
// TESTE ULTRA-DIAGNÓSTICO — HTTP server + WebSocket raw
// ═══════════════════════════════════════════════════════
require('dotenv').config();
const express = require('express');
const dns = require('dns');
const http = require('http');

// ⚡ Força IPv4 (Render às vezes tem problema com IPv6 no gateway)
if (dns.setDefaultResultOrder) dns.setDefaultResultOrder('ipv4first');

// ⚡ SERVIDOR HTTP pra manter o Render vivo
const app = express();
app.get('/', (req, res) => res.send('teste ok'));
app.get('/health', (req, res) => res.json({ ok: true, ws: wsState }));
const port = process.env.PORT || 3000;
const server = app.listen(port, () => console.log(`🌐 HTTP na porta ${port}`));

// ═══════════════════════════════════════════════════════
// Estado global pra debug
// ═══════════════════════════════════════════════════════
let wsState = { status: 'init', ping: null, guilds: 0, error: null };

// ═══════════════════════════════════════════════════════
// Passo 1 — Testar DNS
// ═══════════════════════════════════════════════════════
dns.lookup('gateway.discord.gg', (err, address, family) => {
  console.log('🔍 [DNS] gateway.discord.gg →', err ? `❌ ${err.message}` : `${address} (IPv${family})`);
});

dns.resolve4('gateway.discord.gg', (err, addresses) => {
  console.log('🔍 [DNS-A]', err ? `❌ ${err.message}` : addresses);
});

dns.resolve6('gateway.discord.gg', (err, addresses) => {
  console.log('🔍 [DNS-AAAA]', err ? `❌ ${err.message}` : addresses);
});

// ═══════════════════════════════════════════════════════
// Passo 2 — Testar HTTP raw (fetch do gateway)
// ═══════════════════════════════════════════════════════
setTimeout(async () => {
  try {
    console.log('🔍 [HTTP-TEST] Testando HTTPS pro Discord...');
    const r = await fetch('https://discord.com/api/v10/gateway');
    const j = await r.json();
    console.log('✅ [HTTP-TEST] OK:', j.url);
  } catch (e) {
    console.error('❌ [HTTP-TEST]', e.message);
    wsState.error = e.message;
  }
}, 2000);

// ═══════════════════════════════════════════════════════
// Passo 3 — Testar WebSocket raw
// ═══════════════════════════════════════════════════════
setTimeout(() => {
  console.log('🔍 [WS-RAW] Abrindo WebSocket raw...');
  let WebSocketLib;
  try {
    WebSocketLib = require('ws');
    console.log('✅ [WS-RAW] Using ws package');
  } catch {
    WebSocketLib = global.WebSocket;
    console.log('⚠️ [WS-RAW] Using native WebSocket');
  }

  const ws = new WebSocketLib('wss://gateway.discord.gg/?v=10&encoding=json');
  const t0 = Date.now();

  ws.on('open', () => {
    console.log(`✅✅✅ [WS-RAW] CONECTOU em ${Date.now() - t0}ms`);
    wsState.status = 'open';
  });
  ws.on('message', (data) => {
    const s = data.toString();
    console.log('📩 [WS-RAW] RECEBEU:', s.substring(0, 200));
    wsState.status = 'message';
  });
  ws.on('error', (e) => {
    console.error('❌ [WS-RAW] ERRO:', e.message, e.code);
    wsState.error = `${e.message} (${e.code})`;
  });
  ws.on('close', (code, reason) => {
    console.log('🔌 [WS-RAW] FECHOU code=', code, 'reason=', reason.toString());
  });
  ws.on('unexpected-response', (req, res) => {
    console.error('❌ [WS-RAW] UNEXPECTED RESPONSE:', res.statusCode);
  });
}, 5000);

// ═══════════════════════════════════════════════════════
// Passo 4 — Testar discord.js login
// ═══════════════════════════════════════════════════════
setTimeout(() => {
  console.log('🔍 [DJS] Iniciando discord.js...');
  const { Client, GatewayIntentBits } = require('discord.js');
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.GuildMembers,
    ],
  });

  client.on('debug', (msg) => {
    if (/connecting|identified|heartbeat|ready|session|resume/i.test(msg)) {
      console.log('[DJS-DEBUG]', msg.substring(0, 200));
    }
  });
  client.on('raw', (p) => console.log('[DJS-RAW]', p.t));
  client.on('error', (e) => console.error('❌ [DJS-ERR]', e.message, e.code));
  client.on('shardError', (e) => console.error('❌ [DJS-SHARD-ERR]', e.message, e.code));
  client.on('shardDisconnect', (e, id) => console.error('❌ [DJS-SHARD-DISCONNECT]', id, 'code=', e?.code, 'reason=', e?.reason));
  client.on('shardReady', (id) => console.log('✅ [DJS-SHARD-READY]', id));
  client.on('ready', () => {
    console.log('✅✅✅ [DJS] BOT ONLINE! ✅✅✅');
    console.log('   Tag:', client.user.tag);
    console.log('   Guilds:', client.guilds.cache.size);
    wsState.status = 'online';
    wsState.guilds = client.guilds.cache.size;
  });

  client.login(process.env.DISCORD_TOKEN)
    .then(() => console.log('🔵 [DJS] login() resolved'))
    .catch(e => {
      console.error('❌ [DJS] login() rejected');
      console.error('   msg:', e.message);
      console.error('   code:', e.code);
    });

  // Watchdog
  setTimeout(() => {
    console.error('🚨 [WATCHDOG 40s] Estado:', {
      isReady: client.isReady(),
      wsStatus: client.ws.status,
      wsPing: client.ws.ping,
      tokenLen: process.env.DISCORD_TOKEN?.length,
    });
  }, 40000);
}, 8000);
