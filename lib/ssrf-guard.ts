import { promises as dns } from "dns";

function ipToLong(ip: string): number {
  return ip.split(".").reduce((acc, octet) => (acc << 8) + parseInt(octet, 10), 0) >>> 0;
}

function isIpInCidr(ip: string, cidr: string): boolean {
  const [range, bitsStr] = cidr.split("/");
  const bits = parseInt(bitsStr, 10);
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  return (ipToLong(ip) & mask) === (ipToLong(range) & mask);
}

const PRIVATE_V4_RANGES = [
  "10.0.0.0/8",
  "172.16.0.0/12",
  "192.168.0.0/16",
  "127.0.0.0/8",
  "169.254.0.0/16", // inclui o endpoint de metadados de nuvem 169.254.169.254 (AWS/GCP) — alvo clássico de SSRF
  "0.0.0.0/8",
];

function isPrivateIpv4(ip: string): boolean {
  return PRIVATE_V4_RANGES.some((cidr) => isIpInCidr(ip, cidr));
}

function isPrivateIpv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  return (
    lower === "::1" ||
    lower.startsWith("fc") || // fc00::/7 (ULA)
    lower.startsWith("fd") ||
    lower.startsWith("fe8") || // fe80::/10 (link-local) — cobre fe80-febf
    lower.startsWith("fe9") ||
    lower.startsWith("fea") ||
    lower.startsWith("feb")
  );
}

export interface SsrfCheckResult {
  safe: boolean;
  reason?: string;
}

/**
 * Valida que uma URL de webhook fornecida pelo cliente não aponta para um
 * endereço interno/privado (proteção contra SSRF). Resolve o hostname via DNS
 * e checa TODOS os IPs retornados. Limitação conhecida e aceita nesta versão:
 * não protege contra DNS rebinding entre esta checagem e a chamada real de
 * fetch() (que faz sua própria resolução DNS independente) — mitigado
 * parcialmente ao rechamar esta função logo antes de cada entrega, não só no
 * momento de salvar.
 */
export async function isUrlSafeForOutbound(url: string): Promise<SsrfCheckResult> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { safe: false, reason: "URL inválida." };
  }
  if (parsed.protocol !== "https:") {
    return { safe: false, reason: "A URL precisa começar com https://." };
  }
  const hostname = parsed.hostname.toLowerCase();
  if (hostname === "localhost" || hostname.endsWith(".localhost")) {
    return { safe: false, reason: "Não é permitido apontar para localhost." };
  }
  try {
    const addresses = await dns.lookup(hostname, { all: true });
    for (const { address, family } of addresses) {
      if (family === 4 && isPrivateIpv4(address)) {
        return { safe: false, reason: "A URL aponta para um endereço de rede privado/interno." };
      }
      if (family === 6 && isPrivateIpv6(address)) {
        return { safe: false, reason: "A URL aponta para um endereço de rede privado/interno." };
      }
    }
  } catch {
    return { safe: false, reason: "Não foi possível resolver o endereço da URL." };
  }
  return { safe: true };
}
