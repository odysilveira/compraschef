import type { ContaDre, DB, Produto } from "@/lib/types";
import { inferirEntraNoCmv } from "./produto-cmv";

function normalizarNome(nome?: string): string {
  return (nome ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}

type Regra = { contaId: string; padroes: RegExp[] };

/**
 * Regras por palavra-chave do nome (NF / catálogo) → conta DRE.
 * Ordem importa: a primeira combinação ganha.
 */
const REGRAS_CONTA_DRE: Regra[] = [
  {
    contaId: "dre-op-limpeza",
    padroes: [
      /\bAGUA\s*SANIT/,
      /\bALCOOL\b/,
      /\bDETERGENTE\b/,
      /\bSABAO\b/,
      /\bSABONETE\b/,
      /\bDESINFETANTE\b/,
      /\bLIMPEZA\b/,
      /\bMULTIUSO\b/,
      /\bCLORO\b/,
      /\bPAPEL\s*TOALHA\b/,
      /\bPAPEL\s*HIGIEN/,
    ],
  },
  {
    contaId: "dre-cv-descartaveis",
    padroes: [
      /\bBOBINA\b/,
      /\bCANUDO\b/,
      /\bEMBALAGEM\b/,
      /\bSACOLA\b/,
      /\bGUARDANAPO\b/,
      /\bLUVA\b/,
      /\bMASCARA\b/,
      /\bETIQUETA\b/,
      /\bFITA\s*ADESIVA\b/,
      /\bBOTAO\s*DE\s*PRESSAO\b/,
      /\bCOPO\b/,
      /\bDESCART/,
    ],
  },
  {
    contaId: "dre-cv-carnes-bacon",
    padroes: [/\bBACON\b/, /\bBACONZ/],
  },
  {
    contaId: "dre-cv-carnes-costela",
    padroes: [/\bCOSTELA\b/],
  },
  {
    contaId: "dre-cv-carnes-moida",
    padroes: [/\bMOIDA\b/, /\bPATINHO\b/, /\bACEM\b/, /\bALCATRA\b/, /\bFILE\s*MIGNON\b/, /\bCARNE\s*BOV/],
  },
  {
    contaId: "dre-cv-carnes-frango",
    padroes: [/\bFRANGO\b/, /\bPEITO\b/, /\bSOBRECOXA\b/, /\bCOXINHA\s*DA\s*ASA\b/, /\bFILE\s*DE\s*FRANGO\b/],
  },
  {
    contaId: "dre-cv-molho-vermelho",
    padroes: [/\bMOLHO\b.*\bTOMATE\b/, /\bTOMATE\s*PELATI\b/, /\bPELATI\b/, /\bMOLHO\s*HEINZ\b/, /\bMOLHO\s*VERMELHO\b/, /\bBOLONHESA\b/],
  },
  {
    contaId: "dre-cv-molho-branco",
    padroes: [/\bMOLHO\s*BRANCO\b/, /\bBECHAMEL\b/, /\bMOLHO\s*4\s*QUEIJOS\b/],
  },
  {
    contaId: "dre-cv-risoto",
    padroes: [/\bRISOTO\b/, /\bARBOREO\b/, /\bFUNGHI\b/],
  },
  {
    contaId: "dre-cv-massa",
    padroes: [
      /\bMASSA\b/,
      /\bPENNE\b/,
      /\bESPAGUETE\b/,
      /\bTALHARIM\b/,
      /\bNHOQUE\b/,
      /\bCARACOLINO\b/,
      /\bSEMOLINA\b/,
      /\bFARINHA\b/,
    ],
  },
  {
    contaId: "dre-cv-laticinios",
    padroes: [
      /\bQUEIJO\b/,
      /\bMUCARELA\b/,
      /\bPARMESAO\b/,
      /\bGORGONZOLA\b/,
      /\bPROVOLONE\b/,
      /\bCHEDDAR\b/,
      /\bMANTEIGA\b/,
      /\bCREME\b/,
      /\bLEITE\b/,
      /\bREQUEIJAO\b/,
      /\bIOGURTE\b/,
    ],
  },
  {
    contaId: "dre-cv-hortifruti",
    padroes: [
      /\bTOMATE\b/,
      /\bCEBOLA\b/,
      /\bALFACE\b/,
      /\bALHO\b/,
      /\bCENOURA\b/,
      /\bBROCOLIS\b/,
      /\bABOBRINHA\b/,
      /\bMANJERICAO\b/,
      /\bALECRIM\b/,
      /\bHORTALI/,
      /\bBATATA\b/,
      /\bLIMAO\b/,
      /\bCOENTRO\b/,
      /\bSALSA\b/,
      /\bPIMENTA\b/,
    ],
  },
  {
    contaId: "dre-cv-porcionamentos",
    padroes: [/\sG$/, /\sP$/, /\bPORCION/],
  },
];

/** Sugere conta DRE só pelo nome do produto (sem memória de vínculo). */
export function sugerirContaDrePorNome(nome?: string): string {
  const n = normalizarNome(nome);
  if (!n) return "";

  for (const regra of REGRAS_CONTA_DRE) {
    if (regra.padroes.some((re) => re.test(n))) return regra.contaId;
  }

  // Food genérico da NF: outros CMV; se a heurística de CMV disser que não é food, limpeza.
  if (!inferirEntraNoCmv({ nome })) return "dre-op-limpeza";
  return "dre-cv-outros";
}

export function nomeContaSugerida(contas: ContaDre[] | undefined, contaId: string): string {
  if (!contaId) return "—";
  return (contas ?? []).find((c) => c.id === contaId)?.nome ?? contaId;
}

/**
 * Preenche `conta_dre_id` (e alinha `entra_no_cmv`) nos produtos sem conta.
 * Não sobrescreve classificação manual já salva.
 */
export function aplicarSugestaoContaDreProdutos(
  db: Pick<DB, "produtos" | "contas_dre">,
  opcoes: { soSemConta?: boolean } = { soSemConta: true }
): { preenchidos: number; exemplos: Array<{ nome: string; contaId: string }> } {
  const soSemConta = opcoes.soSemConta !== false;
  const exemplos: Array<{ nome: string; contaId: string }> = [];
  let preenchidos = 0;

  for (const produto of db.produtos) {
    if (produto.ativo === false) continue;
    if (soSemConta && produto.conta_dre_id?.trim()) continue;

    const contaId = sugerirContaDrePorNome(produto.nome);
    if (!contaId) continue;

    produto.conta_dre_id = contaId;
    produto.entra_no_cmv = inferirEntraNoCmv({
      nome: produto.nome,
      contaDreId: contaId,
      contasDre: db.contas_dre,
    });
    preenchidos += 1;
    if (exemplos.length < 12) exemplos.push({ nome: produto.nome, contaId });
  }

  return { preenchidos, exemplos };
}

/** Produtos ativos ainda sem conta DRE. */
export function listarProdutosSemContaDre(produtos: Produto[]): Produto[] {
  return produtos.filter((p) => p.ativo !== false && !p.conta_dre_id?.trim());
}
