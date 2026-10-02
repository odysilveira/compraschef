import type { ResultadoConfrontoBoletoNfe } from "./boleto-nfe-confronto";
import { extrairValorDoCodigoBoleto } from "./boleto-nfe-confronto";

export interface ApresentacaoConfronto {
  variante: "verde" | "amarelo" | "vermelho" | "cinza";
  titulo: string;
  podeConfirmar: boolean;
  exigeJustificativa: boolean;
  exigeSelecaoParcela: boolean;
  proximoPasso?: string;
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
        exigeSelecaoParcela: false,
        proximoPasso: "Confirme o vínculo para adicionar aos pagamentos futuros.",
      };
    case "parcial":
      return {
        variante: "amarelo",
        titulo: "Correspondência provável — precisa de conferência",
        podeConfirmar: true,
        exigeJustificativa: true,
        exigeSelecaoParcela: false,
        proximoPasso: "Confira valor/vencimento/CNPJ e confirme com justificativa.",
      };
    case "divergente":
      return {
        variante: "vermelho",
        titulo: "Divergências encontradas — ainda dá para vincular",
        podeConfirmar: true,
        exigeJustificativa: true,
        exigeSelecaoParcela: resultado.candidatos.length > 1 || !resultado.parcela_id,
        proximoPasso:
          resultado.divergencias.some((d) => /cnpj/i.test(d))
            ? "CNPJ diverge: só confirme se tiver certeza (fica como suspeito)."
            : "Selecione a parcela (se houver mais de uma), justifique e confirme.",
      };
    case "sem_correspondencia":
      return {
        variante: "vermelho",
        titulo: "Nenhuma NF-e ou parcela correspondente encontrada",
        podeConfirmar: false,
        exigeJustificativa: false,
        exigeSelecaoParcela: false,
        proximoPasso: "Vincule manualmente a uma NF-e para criar a parcela e reanalisar.",
      };
    case "duplicada":
      return {
        variante: "cinza",
        titulo: "Este boleto já foi importado",
        podeConfirmar: false,
        exigeJustificativa: false,
        exigeSelecaoParcela: false,
        proximoPasso: "Abra a agenda de pagamentos para ver o documento já vinculado.",
      };
    case "multiplas_possibilidades":
      return {
        variante: "amarelo",
        titulo: "Foram encontradas múltiplas parcelas candidatas",
        podeConfirmar: true,
        exigeJustificativa: true,
        exigeSelecaoParcela: true,
        proximoPasso: "Escolha a parcela correta e confirme com justificativa.",
      };
  }
}

export function candidatoSelecionadoEhValido(candidatos: Array<{ boleto_id: string }>, boletoIdSelecionado?: string): boolean {
  if (!boletoIdSelecionado) return false;
  return candidatos.some((candidato) => candidato.boleto_id === boletoIdSelecionado);
}
