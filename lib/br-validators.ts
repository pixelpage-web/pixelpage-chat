/**
 * Validadores brasileiros (CPF, telefone, senha) — isomórficos, sem acesso a
 * DOM/window, usados tanto em client components quanto em Route Handlers.
 */

/** CPF real (dígitos verificadores mod 11) — não apenas formato. */
export function isValidCPF(raw: string): boolean {
  const cpf = raw.replace(/\D/g, "");
  if (cpf.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(cpf)) return false; // todos os dígitos iguais passam no mod 11 por coincidência matemática — exclusão explícita necessária

  const digits = cpf.split("").map(Number);

  let sum = 0;
  for (let i = 0; i < 9; i++) sum += digits[i] * (10 - i);
  let rest = sum % 11;
  const dv1 = rest < 2 ? 0 : 11 - rest;
  if (dv1 !== digits[9]) return false;

  sum = 0;
  for (let i = 0; i < 10; i++) sum += digits[i] * (11 - i);
  rest = sum % 11;
  const dv2 = rest < 2 ? 0 : 11 - rest;
  if (dv2 !== digits[10]) return false;

  return true;
}

/** Máscara incremental: "000.000.000-00" */
export function formatCPF(value: string): string {
  const d = value.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

/** Celular BR: DDD 11–99, 9 dígitos começando com 9 após o DDD. Aceita com ou sem prefixo 55. */
export function isValidPhoneBR(raw: string): boolean {
  let d = raw.replace(/\D/g, "");
  if (d.length === 13 && d.startsWith("55")) d = d.slice(2);
  if (d.length !== 11) return false;
  const ddd = Number(d.slice(0, 2));
  if (ddd < 11 || ddd > 99) return false;
  if (d[2] !== "9") return false;
  if (/^(\d)\1{10}$/.test(d)) return false; // sequência óbvia (inclui 00000000000)
  return true;
}

/** Máscara incremental: "+55 (00) 0 0000-0000" */
export function formatPhoneBR(value: string): string {
  const d = value.replace(/\D/g, "").replace(/^55/, "").slice(0, 11);
  if (d.length === 0) return "";
  let out = "+55";
  if (d.length > 0) out += ` (${d.slice(0, 2)}`;
  if (d.length >= 2) out += ")";
  if (d.length > 2) out += ` ${d.slice(2, 3)}`;
  if (d.length > 3) out += ` ${d.slice(3, 7)}`;
  if (d.length > 7) out += `-${d.slice(7, 11)}`;
  return out;
}

/** Mínimo 8 caracteres, 1 número, 1 maiúscula. */
export function isValidPassword(password: string): boolean {
  return password.length >= 8 && /[A-Z]/.test(password) && /[0-9]/.test(password);
}

export type PasswordStrength = "fraca" | "media" | "forte";

/** Heurística simples de força — só chamada depois que isValidPassword já passou os mínimos. */
export function passwordStrength(password: string): PasswordStrength {
  if (!isValidPassword(password)) return "fraca";
  let score = 0;
  if (password.length >= 10) score++;
  if (password.length >= 14) score++;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password) && /[0-9]/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;
  if (score >= 3) return "forte";
  if (score >= 1) return "media";
  return "fraca";
}
