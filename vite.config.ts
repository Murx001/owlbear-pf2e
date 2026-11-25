import { defineConfig, type Plugin } from "vite";
import { resolve } from "node:path";

/**
 * O manifesto leva endereços absolutos, para o Owlbear achar os arquivos em qualquer lugar.
 * - dev: monta a partir do endereço que o navegador usou (localhost:5173);
 * - build: usa PAGES_URL (ex.: https://usuario.github.io/repo/), definido no workflow do GitHub.
 */
function manifest(): Plugin {
  const make = (base: string) =>
    JSON.stringify(
      {
        name: "Owlbear PF2e",
        version: "1.0.0",
        manifest_version: 1,
        background_url: `${base}background.html`,
        action: {
          title: "Owlbear PF2e",
          icon: `${base}icon.svg`,
          popover: `${base}index.html`,
          height: 860,
          width: 460,
        },
      },
      null,
      2,
    );
  return {
    name: "pf2e-manifest",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url?.split("?")[0] !== "/manifest.json") return next();
        res.setHeader("Content-Type", "application/json");
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.end(make(`http://${req.headers.host}/`));
      });
    },
    generateBundle() {
      let base = process.env.PAGES_URL ?? "";
      if (base && !base.endsWith("/")) base += "/";
      if (!base) console.warn("PAGES_URL não definido: manifesto com caminhos relativos.");
      this.emitFile({ type: "asset", fileName: "manifest.json", source: make(base) });
    },
  };
}

export default defineConfig({
  // Caminhos relativos: o mesmo build funciona em localhost e em subpasta do GitHub Pages.
  base: "./",
  plugins: [manifest()],
  server: {
    port: 5173,
    strictPort: true,
    // O Owlbear (owlbear.rodeo) precisa ler o manifest de outra origem.
    cors: true,
  },
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        background: resolve(__dirname, "background.html"),
        card: resolve(__dirname, "card.html"),
        log: resolve(__dirname, "log.html"),
        logbtn: resolve(__dirname, "logbtn.html"),
        move: resolve(__dirname, "move.html"),
        horde: resolve(__dirname, "horde.html"),
        conditions: resolve(__dirname, "conditions.html"),
        bestiary: resolve(__dirname, "bestiary.html"),
      },
    },
  },
});
