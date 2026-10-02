import { describe, expect, it } from "vitest";
import {
  chaveSelectFavorita,
  LIMITE_FAVORITAS_INBOX,
  nomePadraoFavorita,
  parseChaveSelectFavorita,
  podeAdicionarFavorita,
  type FavoritaInbox,
} from "./inbox-favoritas";

describe("inbox favoritas", () => {
  it("limita a 10 favoritas", () => {
    expect(LIMITE_FAVORITAS_INBOX).toBe(10);
    expect(podeAdicionarFavorita(9)).toBe(true);
    expect(podeAdicionarFavorita(10)).toBe(false);
  });

  it("gera nome único", () => {
    const existentes: FavoritaInbox[] = [
      { id: "1", nome: "RH", pastaNome: "RH", criadaEm: 1 },
    ];
    expect(nomePadraoFavorita("RH", existentes)).toBe("RH (2)");
    expect(nomePadraoFavorita("Contratos", existentes)).toBe("Contratos");
  });

  it("serializa chave do select", () => {
    expect(chaveSelectFavorita("abc")).toBe("fav:abc");
    expect(parseChaveSelectFavorita("fav:abc")).toBe("abc");
    expect(parseChaveSelectFavorita("restaurante/fotos")).toBeNull();
  });
});
