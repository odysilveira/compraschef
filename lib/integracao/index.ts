// Pontos de integração com o ERP parceiro (Caminho A).
// IMPLEMENTAÇÃO MOCK: registra tudo na fila integracao_eventos e devolve dados simulados.
// Quando a API real do ERP existir, apenas estas funções mudam.

import { mutate, uid } from "@/lib/data";

/** Envia o total de estoque de um produto ao ERP parceiro (mock: só enfileira o evento). */
export function enviarEstoqueTotal(codigoExterno: string | undefined, total: number) {
  if (!codigoExterno) return;
  mutate((db) => {
    db.integracao_eventos.unshift({
      id: uid("ev"),
      direcao: "enviado",
      tipo: "estoque_total",
      payload: { produto: codigoExterno, total },
      status: "pendente",
      tentativas: 0,
      criado_em: new Date().toISOString(),
    });
  });
}

export interface FichaTecnicaInsumo {
  codigo_externo: string;
  quantidade: number; // por 1 unidade de uso do produto final
}

/** Consulta a ficha técnica de um produto produzido no ERP parceiro (mock). */
export function consultarFichaTecnica(codigoExterno: string): FichaTecnicaInsumo[] {
  const fichas: Record<string, FichaTecnicaInsumo[]> = {
    P901: [
      { codigo_externo: "P101", quantidade: 0.6 }, // tomate
      { codigo_externo: "P102", quantidade: 0.2 }, // cebola
    ],
    P902: [{ codigo_externo: "P402", quantidade: 0.8 }], // farinha
    P903: [{ codigo_externo: "P403", quantidade: 0.7 }], // arroz arbóreo
  };
  return fichas[codigoExterno] ?? [];
}

/** Consulta vendas recentes no ERP parceiro (mock) — usadas na previsão de consumo. */
export function consultarVendas(codigoExterno: string): { data: string; quantidade: number }[] {
  const hoje = new Date();
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(hoje);
    d.setDate(d.getDate() - i - 1);
    return { data: d.toISOString().slice(0, 10), quantidade: 3 + ((i * 7 + codigoExterno.length) % 5) };
  });
}
