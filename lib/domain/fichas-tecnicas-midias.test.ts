import { describe, expect, it } from "vitest";
import type { FichaTecnicaMidia } from "../types";
import {
  criarMidiaUrlExterna,
  listarMidiasDaVersao,
  MIDIA_MAX_BYTES_IMAGEM,
  removerMidiaPorId,
  reordenarPassosPreservaAssociacao,
  sanitizarMidiasPersistiveis,
  substituirMidiaDoPasso,
  substituirMidiaPrincipal,
  validarArquivoMidia,
} from "./fichas-tecnicas-midias";

function midiaBase(parcial: Partial<FichaTecnicaMidia> = {}): FichaTecnicaMidia {
  return {
    id: "mid-1",
    versao_id: "ver-1",
    tipo: "FOTO",
    origem: "URL_EXTERNA",
    url: "https://cdn.exemplo.com/foto.jpg",
    criado_em: "2026-07-28T00:00:00.000Z",
    ...parcial,
  };
}

describe("mídias da ficha técnica", () => {
  it("1. aceita imagem válida", () => {
    const tipo = validarArquivoMidia({ name: "foto.png", type: "image/png", size: 1024 * 300 });
    expect(tipo).toBe("FOTO");
  });

  it("2. rejeita formato inválido", () => {
    expect(() => validarArquivoMidia({ name: "arquivo.pdf", type: "application/pdf", size: 1200 })).toThrow(
      "Formato de arquivo não permitido"
    );
  });

  it("3. rejeita arquivo acima do limite", () => {
    expect(() =>
      validarArquivoMidia({
        name: "foto-grande.jpg",
        type: "image/jpeg",
        size: MIDIA_MAX_BYTES_IMAGEM + 1,
      })
    ).toThrow("Arquivo excede o limite");
  });

  it("4. substitui foto principal", () => {
    const antiga = midiaBase({ id: "foto-antiga" });
    const nova = midiaBase({ id: "foto-nova", url: "https://cdn.exemplo.com/nova.jpg" });
    const resultado = substituirMidiaPrincipal([antiga], nova);
    expect(resultado).toHaveLength(1);
    expect(resultado[0].id).toBe("foto-nova");
  });

  it("5. remove foto principal", () => {
    const antiga = midiaBase({ id: "foto-antiga" });
    const resultado = substituirMidiaPrincipal([antiga], undefined);
    expect(resultado).toHaveLength(0);
  });

  it("6. associa mídia ao passo correto", () => {
    const fotoPasso = midiaBase({ id: "mid-passo", passo_id: "passo-1" });
    const resultado = substituirMidiaDoPasso([], "passo-1", fotoPasso);
    expect(resultado).toHaveLength(1);
    expect(resultado[0].passo_id).toBe("passo-1");
  });

  it("7. preserva mídia após reordenação dos passos", () => {
    const midias = [
      midiaBase({ id: "a", passo_id: "p1" }),
      midiaBase({ id: "b", passo_id: "p2" }),
    ];
    const reordenado = reordenarPassosPreservaAssociacao(midias, ["p2", "p1"]);
    expect(reordenado.find((m) => m.id === "a")?.passo_id).toBe("p1");
    expect(reordenado.find((m) => m.id === "b")?.passo_id).toBe("p2");
  });

  it("8. impede mídia de outra versão", () => {
    const midias = [midiaBase({ id: "v1", versao_id: "ver-1" }), midiaBase({ id: "v2", versao_id: "ver-2" })];
    const filtradas = listarMidiasDaVersao(midias, "ver-1");
    expect(filtradas).toHaveLength(1);
    expect(filtradas[0].id).toBe("v1");
  });

  it("9. não persiste File/Blob/ArrayBuffer/base64", () => {
    const invalidaBase64 = midiaBase({ url: "data:image/png;base64,AAAA" });
    expect(() => sanitizarMidiasPersistiveis([invalidaBase64], "ver-1")).toThrow("base64");

    const comBlob = midiaBase() as FichaTecnicaMidia & { blob: Blob };
    comBlob.blob = new Blob(["abc"], { type: "text/plain" });
    expect(() => sanitizarMidiasPersistiveis([comBlob], "ver-1")).toThrow("conteúdo binário");
  });

  it("10. consultas retornam cópias defensivas", () => {
    const origem = [midiaBase({ id: "x" })];
    const consultadas = listarMidiasDaVersao(origem, "ver-1");
    consultadas[0].url = "https://alterada.com/foto.jpg";
    expect(origem[0].url).toBe("https://cdn.exemplo.com/foto.jpg");
  });

  it("11. cria URL externa válida para foto e vídeo", () => {
    const foto = criarMidiaUrlExterna({
      id: "m-foto",
      versaoId: "ver-1",
      url: "https://cdn.exemplo.com/prato.webp",
      tipo: "FOTO",
    });
    const video = criarMidiaUrlExterna({
      id: "m-video",
      versaoId: "ver-1",
      passoId: "passo-1",
      url: "https://cdn.exemplo.com/preparo.mp4",
      tipo: "VIDEO",
    });
    expect(foto.origem).toBe("URL_EXTERNA");
    expect(video.passo_id).toBe("passo-1");
  });

  it("12. remove mídia por id sem afetar demais", () => {
    const origem = [midiaBase({ id: "a" }), midiaBase({ id: "b" })];
    const resultado = removerMidiaPorId(origem, "a");
    expect(resultado.map((item) => item.id)).toEqual(["b"]);
  });
});