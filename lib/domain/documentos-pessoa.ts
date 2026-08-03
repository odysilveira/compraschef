import type {
  DocumentoPessoa,
  PessoaRH,
  StatusDocumentoPessoa,
  TipoDocumentoPessoa,
  TipoPessoaRH,
} from "../types";

export interface ItemCatalogoDocumento {
  tipo: TipoDocumentoPessoa;
  rotulo: string;
  /** Se true, validade vazia + presente ⇒ ainda ok (só vence se data passada). */
  exige_validade?: boolean;
}

/** Catálogo mínimo por tipo de vínculo. */
export function catalogoDocumentosPorTipo(tipo: TipoPessoaRH): ItemCatalogoDocumento[] {
  const base: ItemCatalogoDocumento[] = [
    { tipo: "contrato", rotulo: "Contrato assinado" },
    { tipo: "esocial", rotulo: "eSocial OK" },
    { tipo: "rg", rotulo: "RG / identidade" },
    { tipo: "aso", rotulo: "ASO (exame admissional/periódico)", exige_validade: true },
  ];
  if (tipo === "colaborador") {
    return [...base, { tipo: "ctps", rotulo: "CTPS" }];
  }
  if (tipo === "entregador") {
    return [...base, { tipo: "cnh", rotulo: "CNH", exige_validade: true }];
  }
  return base;
}

export function rotuloTipoDocumento(tipo: TipoDocumentoPessoa): string {
  switch (tipo) {
    case "contrato":
      return "Contrato";
    case "esocial":
      return "eSocial";
    case "aso":
      return "ASO";
    case "rg":
      return "RG";
    case "ctps":
      return "CTPS";
    case "cnh":
      return "CNH";
    case "outro":
      return "Outro";
    default:
      return tipo;
  }
}

export function rotuloStatusDocumento(status: StatusDocumentoPessoa): string {
  switch (status) {
    case "presente":
      return "Presente";
    case "ausente":
      return "Ausente";
    case "vencido":
      return "Vencido";
    default:
      return status;
  }
}

/** YYYY-MM-DD local. */
export function hojeIsoLocal(data = new Date()): string {
  const y = data.getFullYear();
  const m = String(data.getMonth() + 1).padStart(2, "0");
  const d = String(data.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function statusDocumento(
  doc: Pick<DocumentoPessoa, "presente" | "validade">,
  hoje: string = hojeIsoLocal()
): StatusDocumentoPessoa {
  if (!doc.presente) return "ausente";
  if (doc.validade && doc.validade < hoje) return "vencido";
  return "presente";
}

export function idDocumentoPadrao(pessoaId: string, tipo: TipoDocumentoPessoa): string {
  return `doc-${pessoaId}-${tipo}`;
}

/**
 * Garante itens do catálogo na pessoa, sem apagar extras (`outro`).
 * Alinha contrato/eSocial com as flags legadas e anexa `contrato_arquivo` no item contrato.
 */
export function garantirChecklistDocumentos(
  pessoa: PessoaRH,
  agora: string = new Date().toISOString()
): DocumentoPessoa[] {
  const catalogo = catalogoDocumentosPorTipo(pessoa.tipo);
  const atuais = [...(pessoa.documentos ?? [])];
  const porTipo = new Map<TipoDocumentoPessoa, DocumentoPessoa>();
  for (const d of atuais) {
    if (!porTipo.has(d.tipo) || d.tipo === "outro") {
      if (d.tipo !== "outro") porTipo.set(d.tipo, d);
    }
  }

  const resultado: DocumentoPessoa[] = [];
  for (const item of catalogo) {
    const existente = porTipo.get(item.tipo);
    if (existente) {
      resultado.push(existente);
      porTipo.delete(item.tipo);
      continue;
    }
    let presente = false;
    let arquivo = undefined as DocumentoPessoa["arquivo"];
    if (item.tipo === "contrato") {
      presente = Boolean(pessoa.contrato_assinado);
      arquivo = pessoa.contrato_arquivo;
    } else if (item.tipo === "esocial") {
      presente = Boolean(pessoa.esocial_ok);
    }
    resultado.push({
      id: idDocumentoPadrao(pessoa.id, item.tipo),
      tipo: item.tipo,
      rotulo: item.rotulo,
      presente,
      arquivo,
      atualizado_em: agora,
    });
  }

  // Mantém "outro" e tipos fora do catálogo.
  for (const d of atuais) {
    if (d.tipo === "outro" || !catalogo.some((c) => c.tipo === d.tipo)) {
      if (!resultado.some((r) => r.id === d.id)) resultado.push(d);
    }
  }

  return resultado;
}

/** Atualiza flags legadas a partir do checklist (convocação continua usando as flags). */
export function sincronizarFlagsDocumentos(pessoa: PessoaRH): Pick<
  PessoaRH,
  "contrato_assinado" | "esocial_ok" | "contrato_arquivo"
> {
  const docs = pessoa.documentos ?? [];
  const contrato = docs.find((d) => d.tipo === "contrato");
  const esocial = docs.find((d) => d.tipo === "esocial");
  return {
    contrato_assinado: contrato ? contrato.presente : pessoa.contrato_assinado,
    esocial_ok: esocial ? esocial.presente : pessoa.esocial_ok,
    contrato_arquivo: contrato?.arquivo ?? pessoa.contrato_arquivo,
  };
}

export function atualizarDocumentoNaLista(
  documentos: DocumentoPessoa[],
  documentoId: string,
  patch: Partial<Pick<DocumentoPessoa, "presente" | "validade" | "arquivo" | "rotulo">>,
  agora: string = new Date().toISOString()
): DocumentoPessoa[] {
  return documentos.map((d) =>
    d.id === documentoId
      ? {
          ...d,
          ...patch,
          validade: patch.validade === "" ? undefined : patch.validade ?? d.validade,
          atualizado_em: agora,
        }
      : d
  );
}

export interface ResumoDocumentosPessoa {
  total: number;
  presente: number;
  ausente: number;
  vencido: number;
}

export function resumirDocumentos(
  documentos: DocumentoPessoa[],
  hoje: string = hojeIsoLocal()
): ResumoDocumentosPessoa {
  const r: ResumoDocumentosPessoa = { total: documentos.length, presente: 0, ausente: 0, vencido: 0 };
  for (const d of documentos) {
    r[statusDocumento(d, hoje)] += 1;
  }
  return r;
}
