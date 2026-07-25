import type { ResultadoConfrontoBoletoNfe } from "./boleto-nfe-confronto";
import { extrairValorDoCodigoBoleto } from "./boleto-nfe-confronto";

export interface ApresentacaoConfronto {
  variante: "verde" | "amarelo" | "vermelho" | "cinza";
  titulo: string;
  podeConfirmar: boolean;
  exigeJustificativa: boolean;
}

export function mascararLinhaDigitavel(codigo: string, mostrarCompleta: boolean): string {
  if (mostrarCompleta) return codigo;
  const limpo = codigo.replace(/\D+/g, "");
  if (limpo.length <= 8) return limpo;
  const inicio = limpo.slice(0, 6);
  const fim = limpo.slice(-4);
  return `${inicio}...${fim}`;
}

export function valorValidadoComoMoeda(codigoOuLinha: string): number | undefined {
  return extrairValorDoCodigoBoleto(codigoOuLinha);
}

export function apresentarResultadoConfronto(resultado: ResultadoConfrontoBoletoNfe): ApresentacaoConfronto {
  switch (resultado.classificacao) {
    case "exata":
      return {
        variante: "verde",
        titulo: "NF-e e parcela encontradas",
        podeConfirmar: true,
        exigeJustificativa: false,
      };
    case "parcial":
      return {
        variante: "amarelo",
        titulo: "Correspondência provável — precisa de conferência",
        podeConfirmar: true,
        exigeJustificativa: true,
      };
    case "divergente":
      return {
        variante: "vermelho",
        titulo: "Divergências encontradas",
        podeConfirmar: false,
        exigeJustificativa: false,
      };
    case "sem_correspondencia":
      return {
        variante: "vermelho",
        titulo: "Nenhuma NF-e ou parcela correspondente encontrada",
        podeConfirmar: false,
        exigeJustificativa: false,
      };
    case "duplicada":
      return {
        variante: "cinza",
        titulo: "Este boleto já foi importado",
        podeConfirmar: false,
        exigeJustificativa: false,
      };
    case "multiplas_possibilidades":
      return {
        variante: "amarelo",
        titulo: "Foram encontradas múltiplas parcelas candidatas",
        podeConfirmar: false,
        exigeJustificativa: true,
      };
  }
}

export function candidatoSelecionadoEhValido(candidatos: Array<{ boleto_id: string }>, boletoIdSelecionado?: string): boolean {
  if (!boletoIdSelecionado) return false;
  return candidatos.some((candidato) => candidato.boleto_id === boletoIdSelecionado);
}
