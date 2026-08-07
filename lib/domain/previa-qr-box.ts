import type { Caixa, DB } from "../types";
import { produtoOperacionalEfetivo } from "./estoque-boxes";

export function normalizarQrPrevia(valor: string | undefined): string {
  return (valor ?? "").trim();
}

export function localizarBoxParaPreviaManual(db: DB, qrDigitadoParaPrevia: string): Caixa | undefined {
  const qr = normalizarQrPrevia(qrDigitadoParaPrevia).toLowerCase();
  if (!qr) return undefined;
  return db.caixas.find((caixa) => caixa.qr_code.toLowerCase() === qr);
}

export function resolverPreviaManualBox(
  db: DB,
  params: {
    qrDigitadoParaPrevia: string;
    necessidadePrevista?: number;
    quantidadeContada?: number;
  }
) {
  const qrNormalizado = normalizarQrPrevia(params.qrDigitadoParaPrevia);
  const caixa = localizarBoxParaPreviaManual(db, qrNormalizado);
  const produtoEfetivoId = caixa ? produtoOperacionalEfetivo(caixa) : undefined;
  const produtoEfetivo = produtoEfetivoId ? db.produtos.find((produto) => produto.id === produtoEfetivoId) : undefined;
  const unidade = produtoEfetivo?.unidade_uso_id ? db.unidades.find((item) => item.id === produtoEfetivo.unidade_uso_id) : undefined;
  const podeCalcularReposicao = Boolean(caixa && produtoEfetivoId);
  const reposicaoSugerida = podeCalcularReposicao
    ? Math.max((params.necessidadePrevista ?? 0) - (params.quantidadeContada ?? 0), 0)
    : 0;

  return {
    qrNormalizado,
    caixa,
    produtoEfetivoId,
    unidadeUsoId: produtoEfetivo?.unidade_uso_id,
    unidadeSigla: unidade?.sigla,
    qrConfirmadoPorLeituraFisica: undefined,
    localizado: Boolean(caixa),
    mensagem: caixa ? "Box localizado — leitura física do QR ainda pendente." : "QR não encontrado.",
    estadoVisual: caixa ? "QR digitado — não confirmado" : "QR não encontrado.",
    reposicaoSugerida,
    operacaoLiberada: false,
  };
}
