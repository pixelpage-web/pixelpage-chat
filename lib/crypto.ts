import { randomBytes, createCipheriv, createDecipheriv } from "crypto";

/**
 * Cifra de segredos por organização (chave BYOK de IA, chave de auth do n8n
 * do cliente) — AES-256-GCM com o módulo `crypto` nativo do Node, sem
 * dependência nova. Chave mestra em CREDENTIALS_ENCRYPTION_KEY (hex de 64
 * caracteres / 32 bytes), gerada com:
 *   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
 *
 * Caminho crítico de segurança: falha SEMPRE lança (nunca engole erro nem
 * cai silenciosamente em "sem cifrar"/"sem decifrar"). Quem chama não deve
 * capturar essas exceções para seguir em frente — uma config de cifra quebrada
 * precisa aparecer claramente, não se disfarçar de segredo ausente.
 */

function getMasterKey(): Buffer {
  const hex = process.env.CREDENTIALS_ENCRYPTION_KEY;
  if (!hex || hex.length !== 64) {
    throw new Error(
      "CREDENTIALS_ENCRYPTION_KEY ausente ou com tamanho inválido (esperado: 64 caracteres hex / 32 bytes)."
    );
  }
  return Buffer.from(hex, "hex");
}

/** Cifra um segredo (AES-256-GCM). Retorna "iv:authTag:ciphertext" em hex, tudo em um único texto. */
export function encryptSecret(plaintext: string): string {
  const key = getMasterKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${authTag.toString("hex")}:${ciphertext.toString("hex")}`;
}

/** Decifra um valor produzido por encryptSecret. Lança se o formato ou a tag de autenticação forem inválidos. */
export function decryptSecret(stored: string): string {
  const key = getMasterKey();
  const [ivHex, authTagHex, ciphertextHex] = stored.split(":");
  if (!ivHex || !authTagHex || !ciphertextHex) {
    throw new Error("Formato de segredo cifrado inválido.");
  }
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(authTagHex, "hex"));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextHex, "hex")),
    decipher.final(),
  ]).toString("utf8");
}
