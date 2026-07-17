"use client";

// URL curta e discreta pro link de indicação (não revela "indicação"/
// "referral" na URL — ver lib/referral.ts buildReferralUrl). Lógica de
// rastreamento idêntica à rota antiga (/indicacao/[code]), mantida à parte
// só por compatibilidade com links já compartilhados.
export { ReferralLandingPage as default } from "@/components/referral-landing";
