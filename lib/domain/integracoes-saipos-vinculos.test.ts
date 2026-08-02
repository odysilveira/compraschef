import { describe, expect, it } from "vitest";
import {
  aplicarDecisoesNosRegistros,
  calcularProgressoSaipos,
  criarEstadoDecisoesVazio,
  exportarBackupDecisoesSaipos,
  parseEstadoDecisoesSaipos,
  removerDecisaoSaipos,
  salvarDecisaoSaipos,
  sugerirEntidadeInternaSaipos,
  type EntidadeInternaSaipos,
} from "./integracoes-saipos-vinculos";
import type { RegistroSaiposPrevisto } from "./integracoes-saipos";

const entidades: EntidadeInternaSaipos[] = [
  { id: "prod-1", nome: "Lasanha G" },
  { id: "prod-2", nome: "Pizza Quatro Queijos" },
  { id: "prod-3", nome: "Batata Frita" },
];

function registroBase(patch?: Partial<RegistroSaiposPrevisto>): RegistroSaiposPrevisto {
  return {
    linha_planilha: 2,
    tipo: "PRATO",
    codigo_completo: "SAI-1",
    codigo_prato: "SAI-1",
    codigo_prato_pai: "",
    codigo_opcao: "",
    descricao: "Lasanha G",
    descricao_prato: "Lasanha G",
    complemento: "",
    categoria: "Pratos",
    tamanho: "G",
    preco_texto: "12,00",
    preco_centavos: 1200,
    pesavel: "Não",
    ativo: true,
    inativo_texto: "Não",
    classificacao_futura: "NÃO CLASSIFICADO",
    nome_canonico: "Lasanha G",
    alertas: [],
    conflitos: [],
    indicador: "VALIDO",
    codigo_valido: true,
    ...patch,
  };
}

describe("integracoes-saipos-vinculos", () => {
  it("cria e faz parse seguro do estado", () => {
    const vazio = criarEstadoDecisoesVazio();
    expect(vazio.versao).toBe(1);
    expect(Object.keys(vazio.decisoes)).toHaveLength(0);

    expect(parseEstadoDecisoesSaipos(null)).toEqual(vazio);
    expect(parseEstadoDecisoesSaipos({ foo: "bar" })).toEqual(vazio);
  });

  it("gera sugestão por correspondência textual", () => {
    const sugestao = sugerirEntidadeInternaSaipos(registroBase(), entidades);
    expect(sugestao?.id).toBe("prod-1");
  });

  it("salva decisão, aplica nos registros e calcula progresso", () => {
    const estado1 = salvarDecisaoSaipos(criarEstadoDecisoesVazio(), {
      codigo_completo: "SAI-1",
      classificacao_futura: "VARIAÇÃO DO PRATO",
      entidade_interna: entidades[0],
      origem: "manual-individual",
      timestamp: "2026-08-02T10:00:00.000Z",
    });

    const aplicados = aplicarDecisoesNosRegistros([registroBase()], estado1, entidades);
    expect(aplicados[0].decisao?.classificacao_futura).toBe("VARIAÇÃO DO PRATO");
    expect(aplicados[0].decisao?.entidade_interna_id).toBe("prod-1");

    const progresso = calcularProgressoSaipos(aplicados);
    expect(progresso.total).toBe(1);
    expect(progresso.com_decisao).toBe(1);
    expect(progresso.com_vinculo).toBe(1);

    const backup = exportarBackupDecisoesSaipos(estado1);
    expect(backup).toContain("manual-individual");
  });

  it("remove decisão e registra histórico", () => {
    const estado1 = salvarDecisaoSaipos(criarEstadoDecisoesVazio(), {
      codigo_completo: "SAI-1",
      classificacao_futura: "OPERACIONAL",
      entidade_interna: null,
      origem: "manual-ajuste",
      timestamp: "2026-08-02T10:00:00.000Z",
    });

    const estado2 = removerDecisaoSaipos(estado1, "SAI-1", "manual-ajuste", "2026-08-02T10:01:00.000Z");
    expect(estado2.decisoes["SAI-1"]).toBeUndefined();
    expect(estado2.historico[0].evento).toContain("removida");
  });
});
