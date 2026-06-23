/**
 * Controle de acesso a recursos por plano + Super Admin.
 *
 * O Super Admin (email em SUPERADMIN_EMAIL) enxerga TODOS os recursos de
 * todos os planos, mesmo sem assinatura que os cubra — útil para demonstrar
 * e testar a plataforma. Usuários normais seguem o bloqueio padrão por plano.
 *
 * Server-side apenas (lê process.env) — avalie nas pages/rotas e passe o
 * resultado como prop para os componentes client.
 */

export function isSuperAdmin(email?: string | null) {
  return !!email && !!process.env.SUPERADMIN_EMAIL
    ? email.toLowerCase() === process.env.SUPERADMIN_EMAIL.trim().toLowerCase()
    : false;
}

export interface FeatureAccess {
  access: boolean;
  /** true quando o acesso veio do override de Super Admin (exibir badge) */
  isOverride: boolean;
  requiredPlan: string;
}

export function hasFeatureAccess(opts: {
  userEmail?: string | null;
  hasNormalAccess: boolean;
  requiredPlan: string;
}): FeatureAccess {
  if (opts.hasNormalAccess) {
    return { access: true, isOverride: false, requiredPlan: opts.requiredPlan };
  }
  if (isSuperAdmin(opts.userEmail)) {
    return { access: true, isOverride: true, requiredPlan: opts.requiredPlan };
  }
  return { access: false, isOverride: false, requiredPlan: opts.requiredPlan };
}
