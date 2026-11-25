/**
 * Depois de abrir uma engrenagem (ou qualquer bloco que o painel redesenha), rola o painel até ele,
 * para ninguém ter que rolar à mão. O painel é refeito do zero a cada clique, então o elemento só
 * existe depois do redesenho: espera dois quadros e então procura.
 *
 * `scroll-margin-top` (no CSS, classe `.reveal-target`) deixa espaço para o cabeçalho que fica fixo.
 */
export function revealSoon(find: () => Element | null | undefined) {
  window.requestAnimationFrame(() =>
    window.requestAnimationFrame(() => {
      const target = find();
      if (!target) return;
      target.classList.add("reveal-target");
      target.scrollIntoView({ block: "start", behavior: "smooth" });
    }),
  );
}
