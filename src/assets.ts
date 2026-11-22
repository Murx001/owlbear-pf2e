/**
 * Endereço de um arquivo da extensão, relativo à página atual. Funciona na raiz (localhost) e em
 * subpastas (GitHub Pages: usuario.github.io/repo/), onde "/arquivo" quebraria.
 */
export const asset = (path: string): string => new URL(path, location.href).href;
