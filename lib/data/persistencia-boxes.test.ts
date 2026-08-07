import { describe, expect, it } from "vitest";
import { seedDB } from "./seed";
import { carregarBancoPersistido } from "./index";
import { aplicarMetadadosBox, ativarDestinacaoOperacional } from "../domain/estoque-boxes";
import type { Caixa, DB } from "../types";

function prepararCenarioPersistido(): DB {
  const db = structuredClone(seedDB);
  const reserva = db.caixas.find((caixa) => caixa.qr_code === "CXCHEF-007")!;
  const operacional = db.caixas.find((caixa) => caixa.qr_code === "CXCHEF-013")!;

  Object.assign(reserva, aplicarMetadadosBox(reserva, {
    tipo_box: "RESERVA",
    posicao_fisica: "TRAS",
  }));

  Object.assign(operacional, aplicarMetadadosBox(operacional, {
    tipo_box: "OPERACIONAL",
    posicao_fisica: "FRENTE",
    local_id: "loc-freezer1",
  }));
  operacional.quantidade = 0;

  ativarDestinacaoOperacional(db, {
    boxId: operacional.id,
    produtoId: "prod-file",
    usuarioId: "perfil-dono",
    motivo: "Cenario visual da Fase 2",
    agora: "2026-08-06T12:00:00.000Z",
  });

  return db;
}

describe("persistencia local dos boxes da Fase 2", () => {
  it("preserva classificacao, local fisico, destinacao ativa e historico apos duas recargas", () => {
    const salvoAposMutacoes = JSON.stringify(prepararCenarioPersistido());
    const primeiraRecarga = carregarBancoPersistido(salvoAposMutacoes).db;
    const segundaRecarga = carregarBancoPersistido(JSON.stringify(primeiraRecarga)).db;

    for (const db of [primeiraRecarga, segundaRecarga]) {
      const reserva = db.caixas.find((caixa) => caixa.qr_code === "CXCHEF-007")!;
      const operacional = db.caixas.find((caixa) => caixa.qr_code === "CXCHEF-013")!;
      const eventosAtivacao = db.eventos_box_operacional.filter((evento) => evento.tipo === "destinacao_operacional_ativada");
      const eventosEncerramento = db.eventos_box_operacional.filter((evento) => evento.tipo === "destinacao_operacional_encerrada");

      expect(reserva.tipo_box).toBe("RESERVA");
      expect(reserva.posicao_fisica).toBe("TRAS");
      expect(reserva.produto_id).toBe("prod-file");
      expect(reserva.quantidade).toBe(10);
      expect(reserva.local_id).toBe("loc-freezer1");

      expect(operacional.tipo_box).toBe("OPERACIONAL");
      expect(operacional.posicao_fisica).toBe("FRENTE");
      expect(operacional.local_id).toBe("loc-freezer1");
      expect(operacional.produto_operacional_alvo_id).toBe("prod-file");
      expect(operacional.destinacao_operacional_inicio_em).toBe("2026-08-06T12:00:00.000Z");
      expect(operacional.destinacao_operacional_responsavel_id).toBe("perfil-dono");
      expect(operacional.produto_id).toBeUndefined();
      expect(operacional.quantidade).toBe(0);
      expect(operacional.numero).toBe(13);
      expect(operacional.qr_code).toBe("CXCHEF-013");

      expect(eventosAtivacao).toHaveLength(1);
      expect(eventosAtivacao[0].box_numero).toBe(13);
      expect(eventosAtivacao[0].produto_id).toBe("prod-file");
      expect(eventosAtivacao[0].usuario_id).toBe("perfil-dono");
      expect(eventosEncerramento).toHaveLength(0);
    }

    expect(primeiraRecarga.eventos_box_operacional).toHaveLength(segundaRecarga.eventos_box_operacional.length);
  });

  it("aplica defaults seguros somente quando campos antigos realmente nao existiam", () => {
    const legado = structuredClone(seedDB);
    const caixaLegada = legado.caixas.find((caixa) => caixa.qr_code === "CXCHEF-007")! as Partial<Caixa>;
    delete caixaLegada.tipo_box;
    delete caixaLegada.posicao_fisica;

    const carregado = carregarBancoPersistido(JSON.stringify(legado)).db;
    const caixa = carregado.caixas.find((item) => item.qr_code === "CXCHEF-007")!;

    expect(caixa.tipo_box).toBe("NAO_CLASSIFICADO");
    expect(caixa.posicao_fisica).toBe("NAO_INFORMADA");
    expect(caixa.produto_id).toBe("prod-file");
    expect(caixa.quantidade).toBe(10);
    expect(caixa.local_id).toBe("loc-freezer1");
  });
});
