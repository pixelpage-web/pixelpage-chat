/**
 * Textos da PixelPage Chat — português é a única língua da interface (sem
 * seletor de idioma). useT() continua existindo com a mesma assinatura só
 * por compatibilidade com os ~60 componentes que já a chamam; não há mais
 * estado, Context, cookie nem tradução para outro idioma.
 */

/** Passthrough: hoje só existe português, então "traduzir" é devolver o texto. */
export function useT(): (text: string) => string {
  return (text: string) => text;
}
