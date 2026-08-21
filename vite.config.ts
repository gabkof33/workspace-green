import { defineConfig } from "vite";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  server: {
    port: 5173,
    open: true,
  },
  build: {
    target: "es2022",
    outDir: "dist",
    // Sem source map em produção. Com ele, o F12 remonta o TypeScript
    // original inteiro — nomes, comentários e arquivos — a partir do bundle
    // minificado. O dev server continua com mapa próprio, não afetado aqui.
    sourcemap: false,
  },
  esbuild: {
    legalComments: "none",
    // `debugger` esquecido no código vira ponto de parada em produção. Não é
    // defesa contra ninguém — é higiene: some da saída sem depender de
    // revisão.
    drop: ["debugger"],
  },
});

// Sobre ofuscar o bundle: decidido não fazer, e o motivo importa.
//
// Ofuscação não acrescenta fronteira de segurança nenhuma aqui. Todo segredo
// que protege dado nesta aplicação está no Postgres, em policy de RLS; o que
// vai para o navegador é a chave publishable — pública por projeto — e a
// lógica de tela. Renomear identificadores e achatar fluxo de controle
// aumenta o custo de *ler* esse código, não o de *usá-lo*: quem quer a API
// abre a aba de rede e vê as chamadas prontas, sem tocar no JavaScript.
//
// O custo, por outro lado, é concreto: bundle maior, build mais lento e
// stack trace ilegível — e a tela de Observabilidade de APIs desta aplicação
// existe justamente para ler erro de produção.
//
// O que sobra e vale: `sourcemap: false` acima, que impede o F12 de remontar
// o TypeScript original inteiro a partir do bundle minificado. É a diferença
// real entre ler o código-fonte comentado e ler minificado.
