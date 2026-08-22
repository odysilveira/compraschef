import { describe, expect, it } from "vitest";
import { identificarNotaPorTexto } from "./danfe-identificacao";

function gerarChaveNfeValida(base43: string): string {
  let soma = 0;
  let peso = 2;
  for (let i = base43.length - 1; i >= 0; i -= 1) {
    soma += Number(base43[i]) * peso;
    peso = peso === 9 ? 2 : peso + 1;
  }
  const resto = soma % 11;
  const dv = 11 - resto;
  return `${base43}${dv >= 10 ? 0 : dv}`;
}

const CHAVE = gerarChaveNfeValida("3526071234567800019055001000045231100045231");

describe("identificarNotaPorTexto", () => {
  it("lê chave limpa do QR", () => {
    const nota = identificarNotaPorTexto(CHAVE);
    expect(nota?.chave).toBe(CHAVE);
    expect(nota?.cnpj).toBe("12345678000190");
    expect(nota?.numero).toBe("45231");
  });

  it("lê chave com espaços como no PDF/DANFE", () => {
    const formatada = CHAVE.replace(/(\d{4})/g, "$1 ").trim();
    expect(identificarNotaPorTexto(`Chave de Acesso\n${formatada}`)?.chave).toBe(CHAVE);
  });

  it("corrige O→0 na chave via fluxo OCR", () => {
    const idx = CHAVE.indexOf("0");
    expect(idx).toBeGreaterThanOrEqual(0);
    const comO = `${CHAVE.slice(0, idx)}O${CHAVE.slice(idx + 1)}`;
    expect(identificarNotaPorTexto(`chave ${comO}`)?.chave).toBe(CHAVE);
  });

  it("não aceita 44 dígitos inválidos sem aceitarSemDv (evita chave falsa do PDF)", () => {
    const falsa = "3526071234567800019055001000045231100045239"; // DV errado de propósito
    expect(identificarNotaPorTexto(`lixo ${falsa} mais texto`)).toBeNull();
  });

  it("aceita chave sem DV só com opção de QR", () => {
    const quase = CHAVE.slice(0, 43) + (CHAVE[43] === "0" ? "1" : "0");
    expect(identificarNotaPorTexto(quase)).toBeNull();
    expect(identificarNotaPorTexto(quase, { aceitarSemDv: true })?.chave).toBe(quase);
  });
});
