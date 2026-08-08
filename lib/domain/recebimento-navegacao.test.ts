import { describe, expect, it } from "vitest";
import {
  filtrarRecebimentosPorStatus,
  hrefRecebimento,
  parseFiltroRecebimento,
} from "./recebimento-navegacao";

describe("navegação recebimento", () => {
  it("parseia status e monta href", () => {
    expect(parseFiltroRecebimento("problema")).toBe("problema");
    expect(parseFiltroRecebimento("ok")).toBe("ok");
    expect(parseFiltroRecebimento("xyz")).toBe("todos");
    expect(hrefRecebimento()).toBe("/recebimento");
    expect(hrefRecebimento({ status: "todos" })).toBe("/recebimento");
    expect(hrefRecebimento({ status: "problema" })).toBe("/recebimento?status=problema");
    expect(hrefRecebimento({ status: "ok", recebimento: "rec-2" })).toBe(
      "/recebimento?status=ok&recebimento=rec-2"
    );
    expect(hrefRecebimento({ recebimento: "rec-1" })).toBe("/recebimento?recebimento=rec-1");
  });

  it("filtra problema = divergente|parcial", () => {
    const lista = [
      { id: "1", status: "ok" as const },
      { id: "2", status: "divergente" as const },
      { id: "3", status: "parcial" as const },
    ];
    expect(filtrarRecebimentosPorStatus(lista, "todos")).toHaveLength(3);
    expect(filtrarRecebimentosPorStatus(lista, "ok").map((r) => r.id)).toEqual(["1"]);
    expect(filtrarRecebimentosPorStatus(lista, "problema").map((r) => r.id)).toEqual(["2", "3"]);
  });
});
