import { describe, expect, it } from "vitest";
import {
  apresentarResultadoConfronto,
  candidatoSelecionadoEhValido,
  mascararLinhaDigitavel,
  valorValidadoComoMoeda,
} from "./importar-boleto-ui";

const LINHA_BANCARIA_47 = "34191.23454 67890.123457 67890.123457 1 12340000001000";

describe("interface importar boleto - utilitários", () => {
  it("máscara da linha digitável", () => {
    expect(mascararLinhaDigitavel("34191234546789012345767890123457112340000001000", false)).toBe("341912...1000");
    expect(mascararLinhaDigitavel("34191234546789012345767890123457112340000001000", true)).toBe(
      "34191234546789012345767890123457112340000001000"
    );
  });

  it("valor validado aparece como moeda", () => {
    expect(valorValidadoComoMoeda(LINHA_BANCARIA_47)).toBe(10);
  });

  it("apresentação de exata", () => {
    const view = apresentarResultadoConfronto({
      classificacao: "exata",
      candidatos: [],
      criterios_coincidentes: [],
      divergencias: [],
      avisos: [],
      exige_confirmacao_humana: false,
    });
    expect(view.variante).toBe("verde");
    expect(view.podeConfirmar).toBe(true);
  });

  it("apresentação de parcial", () => {
    const view = apresentarResultadoConfronto({
      classificacao: "parcial",
      candidatos: [],
      criterios_coincidentes: [],
      divergencias: [],
      avisos: [],
      exige_confirmacao_humana: true,
    });
    expect(view.variante).toBe("amarelo");
    expect(view.exigeJustificativa).toBe(true);
  });

  it("apresentação de divergente", () => {
    const view = apresentarResultadoConfronto({
      classificacao: "divergente",
      candidatos: [],
      criterios_coincidentes: [],
      divergencias: ["Valor divergente."],
      avisos: [],
      exige_confirmacao_humana: true,
    });
    expect(view.variante).toBe("vermelho");
    expect(view.podeConfirmar).toBe(false);
  });

  it("apresentação de duplicada", () => {
    const view = apresentarResultadoConfronto({
      classificacao: "duplicada",
      candidatos: [],
      criterios_coincidentes: [],
      divergencias: [],
      avisos: [],
      exige_confirmacao_humana: true,
    });
    expect(view.titulo).toBe("Este boleto já foi importado");
    expect(view.podeConfirmar).toBe(false);
  });

  it("apresentação de sem correspondência", () => {
    const view = apresentarResultadoConfronto({
      classificacao: "sem_correspondencia",
      candidatos: [],
      criterios_coincidentes: [],
      divergencias: [],
      avisos: [],
      exige_confirmacao_humana: true,
    });
    expect(view.titulo).toContain("Nenhuma NF-e");
    expect(view.podeConfirmar).toBe(false);
  });

  it("candidato múltiplo válido pode ser selecionado", () => {
    expect(candidatoSelecionadoEhValido([{ boleto_id: "b1" }, { boleto_id: "b2" }], "b2")).toBe(true);
  });

  it("candidato arbitrário é rejeitado", () => {
    expect(candidatoSelecionadoEhValido([{ boleto_id: "b1" }, { boleto_id: "b2" }], "x")).toBe(false);
  });
});
