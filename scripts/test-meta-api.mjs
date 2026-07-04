/**
 * Teste direto das chamadas Meta Cloud API (subscribeAppToWaba + registerPhoneNumber).
 *
 * Uso:
 *   META_SYSTEM_USER_TOKEN=<token> META_WABA_ID=991991910337668 node scripts/test-meta-api.mjs
 *
 * Ou adicione as vars em .env.local e execute:
 *   node --env-file=.env.local scripts/test-meta-api.mjs
 *   (Node 20.6+; se não funcionar, use dotenv-cli: npx dotenv -e .env.local -- node scripts/test-meta-api.mjs)
 */

const GRAPH_VERSION = process.env.META_GRAPH_VERSION ?? "v21.0";
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;
const TOKEN = process.env.META_SYSTEM_USER_TOKEN;
const WABA_ID = process.env.META_WABA_ID ?? "991991910337668";

if (!TOKEN) {
  console.error("ERRO: META_SYSTEM_USER_TOKEN não definido.");
  console.error("Execute: META_SYSTEM_USER_TOKEN=<token> node scripts/test-meta-api.mjs");
  process.exit(1);
}

function header() { return { Authorization: `Bearer ${TOKEN}` }; }

async function call(label, url, init = {}) {
  console.log(`\n[${label}] ${init.method ?? "GET"} ${url}`);
  const res = await fetch(url, { ...init, headers: { ...header(), ...init.headers } });
  const body = await res.json().catch(() => null);
  console.log(`  HTTP ${res.status} →`, JSON.stringify(body, null, 2));
  return { ok: res.ok, status: res.status, body };
}

// ─── 1. subscribeAppToWaba ───────────────────────────────────────────────────
const sub = await call(
  "subscribeAppToWaba",
  `${GRAPH_BASE}/${WABA_ID}/subscribed_apps`,
  { method: "POST" }
);

// ─── 2. Listar phone_numbers da WABA ────────────────────────────────────────
const phones = await call(
  "listPhoneNumbers",
  `${GRAPH_BASE}/${WABA_ID}/phone_numbers`
);

const phoneList = phones.body?.data ?? [];
if (phoneList.length === 0) {
  console.log("\n[registerPhoneNumber] Pulado — nenhum phone_number encontrado na WABA.");
  console.log(
    "\nPara testar registerPhoneNumber, forneça um phone_number_id diretamente:\n" +
    "  PHONE_NUMBER_ID=<id> node scripts/test-meta-api.mjs"
  );
  process.exit(sub.ok ? 0 : 1);
}

// Usa phone_number_id da env ou o primeiro encontrado
const phoneId = process.env.PHONE_NUMBER_ID ?? phoneList[0].id;
console.log(`\nUsando phone_number_id: ${phoneId} (${phoneList[0].display_phone_number ?? "?"})`);

// ─── 3. registerPhoneNumber ──────────────────────────────────────────────────
const reg = await call(
  "registerPhoneNumber",
  `${GRAPH_BASE}/${phoneId}/register`,
  {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", pin: "000000" }),
  }
);

// ─── Resumo ──────────────────────────────────────────────────────────────────
console.log("\n=== RESUMO ===");
console.log(`subscribeAppToWaba  → ${sub.ok ? "✅ OK" : `❌ HTTP ${sub.status}: ${sub.body?.error?.message ?? JSON.stringify(sub.body)}`}`);
console.log(`registerPhoneNumber → ${reg.ok ? "✅ OK" : `❌ HTTP ${reg.status}: ${reg.body?.error?.message ?? JSON.stringify(reg.body)}`}`);
