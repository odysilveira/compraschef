import { describe, expect, it } from "vitest";
import { seedDB } from "../data/seed";
import type { DB, PagamentoPessoa } from "../types";
import { listarLotePagarEquipe, marcarPagamentoEquipePago } from "./pagar-equipe";

describe("pagar-equipe", () => {
  it("lista pagamentos liberados/previstos de equipe com PIX gerável", () => {
    const db = structuredClone(seedDB) as DB;
    const freela = db.pessoas.find((p) => p.tipo === "prestador_eventual" || p.tipo === "intermitente");
    expect(freela?.chave_pix).toBeTruthy();

    const pag: PagamentoPessoa = {
      id: "pag-eq-1",
      pessoa_id: freela!.id,
      tipo: "freela_hora",
      descricao: "Turno sábado",
      competencia: "2026-03",
      vencimento: "2026-03-15",
      valor: 120,
      status: "liberado",
      criado_em: "2026-03-01T12:00:00.000Z",
      atualizado_em: "2026-03-01T12:00:00.000Z",
    };
    db.pagamentos_pessoas.push(pag);

    const lote = listarLotePagarEquipe(db, { competencia: "2026-03" });
    const item = lote.find((i) => i.pagamento.id === "pag-eq-1");
    expect(item).toBeTruthy();
    expect(item!.pode_gerar_pix).toBe(true);
    expect(item!.payload_pix).toMatch(/^000201/);
  });

  it("marca pagamento como pago após PIX", () => {
    const db = structuredClone(seedDB) as DB;
    const moto = db.pessoas.find((p) => p.tipo === "entregador");
    expect(moto).toBeTruthy();
    db.pagamentos_pessoas.push({
      id: "pag-moto-1",
      pessoa_id: moto!.id,
      tipo: "outro",
      descricao: "Diária + km",
      competencia: "2026-03",
      vencimento: "2026-03-10",
      valor: 200,
      status: "previsto",
      criado_em: "2026-03-01T12:00:00.000Z",
      atualizado_em: "2026-03-01T12:00:00.000Z",
    });

    const r = marcarPagamentoEquipePago(db, "pag-moto-1", {
      bancoConta: "Conta principal",
      responsavel: "teste",
      dataPagamento: "2026-03-10",
      agora: "2026-03-10T18:00:00.000Z",
    });
    expect(r.sucesso).toBe(true);
    const pag = db.pagamentos_pessoas.find((p) => p.id === "pag-moto-1");
    expect(pag?.status).toBe("pago");
  });
});
