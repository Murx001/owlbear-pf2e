# Owlbear PF2e

Extensão do Owlbear Rodeo para Pathfinder 2e (fichas do Pathbuilder, rolagens, condições, combate entre tokens).

- **Escopo e decisões:** [docs/ESCOPO.md](docs/ESCOPO.md) — leia primeiro a Parte 4 (decisões consolidadas e testes rápidos) e o roteiro da Parte 1.
- **Stack:** TypeScript + Vite + `@owlbear-rodeo/sdk`. Idioma da interface: PT-BR.
- **Dev:** `npm run dev` (porta 5173 fixa, CORS ligado em `vite.config.ts`); instalar no Owlbear pela URL `http://localhost:5173/manifest.json`.
- **Estado atual:** esqueleto funcionando + rolador de d20/dados com grau de sucesso PF2e (`src/main.ts`).
- Cada passo deve ser validado no Owlbear antes de seguir; riscos primeiro (CORS do Pathbuilder, permissões de token).
