/**
 * Textos da PixelPage Chat — português é a única língua da interface (sem
 * seletor de idioma). useT() continua existindo com a mesma assinatura só
 * por compatibilidade com os ~60 componentes que já a chamam; não há mais
 * estado, Context, cookie nem tradução para outro idioma.
 */

// Referência de função única e estável — a versão anterior (useCallback com
// deps [lang]) garantia que `t` não mudasse de identidade a cada render;
// retornar uma arrow function nova a cada chamada de useT() quebrava todo
// useCallback/useEffect que tinha `t` nas deps (loop infinito de refetch).
const identity = (text: string) => text;

/** Passthrough: hoje só existe português, então "traduzir" é devolver o texto. */
export function useT(): (text: string) => string {
  return identity;
}
