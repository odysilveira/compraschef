/**
 * PDF com DANFE + vários boletos (ex.: merge): vira N documentos na Conferência.
 */

import type { DB, DocumentoBoleto } from "../types";
import { validarBoleto } from "./boletos";
import type { PaginaBoletoIdentificada } from "./identificacao-boleto-browser";

export interface ResultadoExpandirBoletoMultipagina {
  ok: boolean;
  erros: string[];
  avisos: string[];
  /** Documentos finais (páginas de boleto), incluindo o original atualizado. */
  documentos: DocumentoBoleto[];
  paginasDanfe: number;
  paginasBoleto: number;
}

/**
 * Transforma um documento único (PDF merge) em um doc por página de boleto.
 * Páginas DANFE são ignoradas. O documento original vira a 1ª página de boleto.
 */
export function expandirDocumentoBoletoMultipagina(
  db: DB,
  entrada: {
    documentoId: string;
    paginas: PaginaBoletoIdentificada[];
  },
  opcoes: { gerarId?: () => string; agora?: string } = {}
): ResultadoExpandirBoletoMultipagina {
  const documento = db.documentos_boleto.find((d) => d.id === entrada.documentoId);
  if (!documento) {
    return { ok: false, erros: ["Documento não encontrado."], avisos: [], documentos: [], paginasDanfe: 0, paginasBoleto: 0 };
  }
  if (documento.confirmado_em) {
    return {
      ok: false,
      erros: ["Este boleto já foi pareado. Não dá para separar páginas."],
      avisos: [],
      documentos: [],
      paginasDanfe: 0,
      paginasBoleto: 0,
    };
  }

  const paginasDanfe = entrada.paginas.filter((p) => p.pareceDanfe).length;
  const boletoPaginas = entrada.paginas.filter((p) => !p.pareceDanfe);
  if (boletoPaginas.length < 2) {
    return {
      ok: false,
      erros: [
        boletoPaginas.length === 0
          ? "Não achei páginas de boleto neste PDF (só DANFE/nota?)."
          : "Este PDF parece ter só 1 página de boleto — nada a separar.",
      ],
      avisos: [],
      documentos: [],
      paginasDanfe,
      paginasBoleto: boletoPaginas.length,
    };
  }

  const agora = opcoes.agora ?? new Date().toISOString();
  const avisos: string[] = [];
  const documentos: DocumentoBoleto[] = [];
  const gerarId = opcoes.gerarId ?? (() => `docbol-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`);

  const aplicarLinha = (doc: DocumentoBoleto, linha?: string) => {
    if (!linha) {
      doc.linha_informada = undefined;
      doc.codigo_canonico = undefined;
      doc.formato_boleto = undefined;
      doc.resultado_confronto = "sem_correspondencia";
      return;
    }
    const validacao = validarBoleto(linha);
    if (!validacao.valido || validacao.formato === "invalido") {
      avisos.push(`Página ${doc.pagina_pdf}: linha lida inválida — deixe para colar à mão.`);
      doc.resultado_confronto = "sem_correspondencia";
      return;
    }
    // Evita colidir com outro doc já existente com o mesmo código
    const outro = db.documentos_boleto.find(
      (d) => d.id !== doc.id && d.codigo_canonico === validacao.codigoCanonico
    );
    if (outro) {
      avisos.push(`Página ${doc.pagina_pdf}: código já existe em outro boleto — sem gravar linha.`);
      doc.resultado_confronto = "sem_correspondencia";
      return;
    }
    doc.linha_informada = validacao.valorNormalizado;
    doc.codigo_canonico = validacao.codigoCanonico;
    doc.formato_boleto = validacao.formato === "invalido" ? undefined : validacao.formato;
    doc.resultado_confronto = "sem_correspondencia";
  };

  // 1ª página de boleto → atualiza o documento original
  const primeira = boletoPaginas[0];
  documento.pagina_pdf = primeira.pagina;
  documento.nome_arquivo = rotuloNomePagina(documento.nome_arquivo, primeira.pagina, boletoPaginas.length);
  aplicarLinha(documento, primeira.validos[0]?.valorNormalizado);
  documentos.push(documento);

  // Demais páginas → novos documentos (mesmo hash/arquivo)
  for (let i = 1; i < boletoPaginas.length; i += 1) {
    const pag = boletoPaginas[i];
    const novo: DocumentoBoleto = {
      id: gerarId(),
      nome_arquivo: rotuloNomePagina(documento.nome_arquivo.replace(/\s*·\s*pág\.\s*\d+.*/i, ""), pag.pagina, boletoPaginas.length),
      tipo_arquivo: documento.tipo_arquivo,
      tamanho_bytes: documento.tamanho_bytes,
      hash_sha256: documento.hash_sha256,
      pagina_pdf: pag.pagina,
      criado_em: agora,
      criado_por: documento.criado_por || "usuário local",
      resultado_confronto: "sem_correspondencia",
    };
    aplicarLinha(novo, pag.validos[0]?.valorNormalizado);
    db.documentos_boleto.push(novo);
    documentos.push(novo);
  }

  if (paginasDanfe > 0) {
    avisos.push(`Ignorei ${paginasDanfe} página(s) de DANFE/nota no início do PDF.`);
  }
  const semLeitura = documentos.filter((d) => !d.linha_informada).length;
  if (semLeitura > 0) {
    avisos.push(
      `${semLeitura} boleto(s) sem linha lida — marque com a nota (usa valor da parcela) ou cole a linha digitável.`
    );
  }

  return {
    ok: true,
    erros: [],
    avisos,
    documentos,
    paginasDanfe,
    paginasBoleto: boletoPaginas.length,
  };
}

function rotuloNomePagina(nomeBase: string, pagina: number, totalBoletos: number): string {
  const base = nomeBase.replace(/\s*·\s*pág\.\s*\d+.*/i, "").trim() || "boleto.pdf";
  return `${base} · pág. ${pagina} (${totalBoletos} boletos)`;
}
