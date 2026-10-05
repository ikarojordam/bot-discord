#!/usr/bin/env node
// Scanner simples de segredos — roda no pre-commit e no CI.
// Uso: node scripts/scan-secrets.js            (arquivos versionados; sem git, varre a pasta)
//      node scripts/scan-secrets.js --staged   (só o que está no commit atual)
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const SELF = path.relative(ROOT, __filename);

const RULES = [
  { name: 'Token de bot do Discord', re: /\b[MNO][A-Za-z\d_-]{23,27}\.[\w-]{6}\.[\w-]{27,40}\b/ },
  { name: 'JWT (ex.: chave do Supabase)', re: /\beyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}\b/ },
  { name: 'URL de projeto Supabase', re: /https:\/\/[a-z0-9]{16,24}\.supabase\.co/i },
  { name: 'Webhook do Discord', re: /discord(?:app)?\.com\/api\/(?:v\d+\/)?webhooks\/\d{15,}\/[\w-]{20,}/i },
  { name: 'Token do Mercado Pago', re: /\b(?:APP_USR|TEST)-[\w-]{20,}/ },
  { name: 'Chave privada', re: /-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----/ },
  { name: 'Chave AWS', re: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: 'Token GitHub', re: /\bgh[pousr]_[A-Za-z0-9]{30,}\b/ },
  { name: 'Atribuição de segredo literal', re: /\b(?:secret|token|password|senha|api[_-]?key)\b\s*[:=]\s*['"`][A-Za-z0-9_\-+/=.]{20,}['"`]/i },
];
const SKIP_DIR = new Set(['node_modules', '.git', '__MACOSX']);
const SKIP_EXT = /\.(png|jpe?g|gif|webp|ico|mp3|mp4|zip|gz|pdf|woff2?|ttf)$/i;

function listFiles() {
  const staged = process.argv.includes('--staged');
  try {
    const cmd = staged ? 'git diff --cached --name-only --diff-filter=ACMR' : 'git ls-files';
    const out = execSync(cmd, { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    return out ? out.split('\n') : [];
  } catch {
    const acc = [];
    (function walk(d) {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        if (SKIP_DIR.has(e.name)) continue;
        const full = path.join(d, e.name);
        if (e.isDirectory()) walk(full); else acc.push(path.relative(ROOT, full));
      }
    })(ROOT);
    return acc;
  }
}

let problems = 0;
for (const rel of listFiles()) {
  if (rel === SELF || SKIP_EXT.test(rel)) continue;
  // arquivo .env real versionado = falha imediata
  if (/(^|\/)\.env(\..+)?$/.test(rel) && !/\.env\.example$/.test(rel)) {
    console.error(`❌ ${rel}: arquivo de ambiente não pode ser versionado`); problems++; continue;
  }
  let text;
  try { text = fs.readFileSync(path.join(ROOT, rel), 'utf8'); } catch { continue; }
  text.split('\n').forEach((line, idx) => {
    if (line.length > 2000) return;
    for (const r of RULES) {
      if (r.re.test(line)) { console.error(`❌ ${rel}:${idx + 1} possível segredo (${r.name})`); problems++; }
    }
  });
}
if (problems) {
  console.error(`\n${problems} problema(s). Remova o valor do código, coloque em variável de ambiente e, se já foi publicado, ROTACIONE o segredo.`);
  process.exit(1);
}
console.log('✅ Nenhum segredo encontrado.');
