import { dataBR, moeda } from "../format";
import type { ConsumoPessoa, PagamentoPessoa, PessoaRH } from "../types";
import { RAZAO_SOCIAL_PADRAO, formatDataBrLonga } from "./escala";
import { rotuloTipoPagamentoPessoa } from "./pagamentos-pessoas";
import { rotuloFuncao, rotuloTipoPessoa, somenteDigitosTelefone } from "./rh";

function fmtHoras(valor: number): string {
  return valor.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function primeiroNome(nome: string): string {
  return nome.split(/\s+/)[0] ?? nome;
}

function dataPeriodo(pagamento: PagamentoPessoa): string {
  if (pagamento.pagamento_data) return formatDataBrLonga(pagamento.pagamento_data);
  if (pagamento.vencimento) return formatDataBrLonga(pagamento.vencimento);
  if (pagamento.competencia) {
    const [ano, mes] = pagamento.competencia.split("-");
    if (ano && mes) return `${mes}/${ano}`;
  }
  return "—";
}

/**
 * Recibo discriminado + fechamento (modelo WhatsApp §8), pronto para colar.
 * Não é assinatura digital — a via física continua necessária.
 */
export function montarTextoReciboPagamentoPessoa(input: {
  pessoa: PessoaRH;
  pagamento: PagamentoPessoa;
  consumos?: ConsumoPessoa[];
  razaoSocial?: string;
}): string {
  const { pessoa, pagamento } = input;
  const razao = input.razaoSocial ?? RAZAO_SOCIAL_PADRAO;
  const liquido = pagamento.pagamento_valor ?? pagamento.valor;
  const bruto = pagamento.valor_bruto ?? pagamento.valor;
  const horas = pagamento.horas;
  const valorHora = pagamento.valor_hora ?? pessoa.valor_hora;
  const eIntermitente =
    pagamento.tipo === "intermitente_periodo" ||
    pagamento.tipo === "freela_hora" ||
    pessoa.tipo === "intermitente" ||
    pessoa.tipo === "entregador";

  const linhas: string[] = [];

  if (eIntermitente && horas != null && horas > 0) {
    linhas.push(
      `${primeiroNome(pessoa.nome)}, período de ${dataPeriodo(pagamento)} encerrado: ${fmtHoras(horas)} h líquidas/pagas.`
    );
  } else {
    linhas.push(
      `${primeiroNome(pessoa.nome)}, segue o recibo discriminado do pagamento (${rotuloTipoPagamentoPessoa(pagamento.tipo)}).`
    );
  }
  linhas.push("");
  linhas.push("RECIBO DISCRIMINADO");
  linhas.push(`Empresa: ${razao}`);
  linhas.push(`Trabalhador(a): ${pessoa.nome}`);
  linhas.push(`Tipo: ${rotuloTipoPessoa(pessoa.tipo)}${pessoa.funcao ? ` · ${rotuloFuncao(pessoa)}` : ""}`);
  if (pessoa.cpf) linhas.push(`CPF: ${pessoa.cpf}`);
  linhas.push(`Natureza: ${rotuloTipoPagamentoPessoa(pagamento.tipo)}`);
  if (pagamento.descricao) linhas.push(`Referência: ${pagamento.descricao}`);
  if (pagamento.competencia) linhas.push(`Competência: ${pagamento.competencia}`);
  linhas.push("");

  if (horas != null && horas > 0 && valorHora != null && valorHora > 0) {
    const horasX = Number((horas * valorHora).toFixed(2));
    linhas.push(`• Horas pagas: ${fmtHoras(horas)} h × ${moeda(valorHora)} = ${moeda(horasX)}`);
    if (eIntermitente) {
      linhas.push(
        "• Verbas proporcionais (13º, férias + 1/3 e DSR): incluídas no valor bruto quando aplicável ao período"
      );
    }
  }

  linhas.push(`• Valor bruto: ${moeda(bruto)}`);
  if (pagamento.desconto_adiantamento && pagamento.desconto_adiantamento > 0) {
    linhas.push(`• (−) Adiantamento: ${moeda(pagamento.desconto_adiantamento)}`);
  }
  if (pagamento.desconto_consumo && pagamento.desconto_consumo > 0) {
    linhas.push(`• (−) Consumo no restaurante: ${moeda(pagamento.desconto_consumo)}`);
    const consumos = (input.consumos ?? []).filter((c) => (pagamento.consumo_ids ?? []).includes(c.id));
    for (const c of consumos) {
      linhas.push(`    – ${dataBR(c.data)} ${c.descricao}: ${moeda(c.valor_liquido)}`);
    }
  }
  linhas.push(`• Líquido: ${moeda(liquido)}`);
  linhas.push("");

  if (pagamento.pagamento_data) {
    linhas.push(`Data do pagamento: ${dataBR(pagamento.pagamento_data)}`);
  }
  if (pagamento.pagamento_banco_conta) {
    linhas.push(`Conta de origem (restaurante): ${pagamento.pagamento_banco_conta}`);
  }
  if (pessoa.chave_pix) {
    linhas.push(`Destino (PIX): ${pessoa.chave_pix}`);
  }
  if (pagamento.status === "pago") {
    linhas.push("Status: pago (conciliado no extrato/banco).");
  } else if (pagamento.status === "aguardando_conciliacao") {
    linhas.push("Status: pagamento informado — aguardando conciliação bancária (informado ≠ liquidado).");
  } else {
    linhas.push(`Status: ${pagamento.status}.`);
  }

  linhas.push("");
  linhas.push(
    "Segue o recibo discriminado — por favor, confirme o recebimento e assine a via física na próxima vez que estiver aqui."
  );
  linhas.push("");
  if (eIntermitente) {
    linhas.push("Esta mensagem integra o registro do contrato de trabalho intermitente.");
  } else {
    linhas.push("Este recibo integra o registro do pagamento junto à empresa.");
  }

  return linhas.join("\n");
}

/** Modelo curto para o empregado confirmar o recebimento (WhatsApp §10). */
export function montarTextoConfirmacaoRecebimento(input: {
  pessoa: PessoaRH;
  pagamento: PagamentoPessoa;
}): string {
  const { pessoa, pagamento } = input;
  const liquido = pagamento.pagamento_valor ?? pagamento.valor;
  const horas = pagamento.horas;
  const data = pagamento.pagamento_data ? dataBR(pagamento.pagamento_data) : dataBR(pagamento.vencimento);
  const via = pessoa.chave_pix ? "PIX" : "transferência";
  const trechoHoras = horas != null && horas > 0 ? ` (horas líquidas/pagas ${fmtHoras(horas)} h)` : "";

  return [
    `Confirmo o recebimento de ${moeda(liquido)} referente ao período de ${data}${trechoHoras}, via ${via}, conforme recibo discriminado.`,
    "",
    `Nome: ${pessoa.nome} · Data: ${dataBR(new Date().toISOString().slice(0, 10))}`,
  ].join("\n");
}

/**
 * Concatena recibos/confirmações WhatsApp de vários pagamentos com cabeçalho por pessoa.
 * Não altera status — só monta texto para colar.
 */
export function montarTextosWhatsAppRecibosPagamentoLote(
  pagamentos: PagamentoPessoa[],
  opts: {
    pessoaPorId: (id: string) => PessoaRH | undefined;
    consumos?: ConsumoPessoa[];
    variante?: "recibo" | "confirmacao";
    razaoSocial?: string;
  }
): string {
  const variante = opts.variante ?? "recibo";
  const blocos: string[] = [];
  for (const pagamento of pagamentos) {
    const pessoa = opts.pessoaPorId(pagamento.pessoa_id);
    if (!pessoa) continue;
    const texto = (
      variante === "confirmacao"
        ? montarTextoConfirmacaoRecebimento({ pessoa, pagamento })
        : montarTextoReciboPagamentoPessoa({
            pessoa,
            pagamento,
            consumos: opts.consumos,
            razaoSocial: opts.razaoSocial,
          })
    ).trim();
    if (!texto) continue;
    const nome = pessoa.nome.trim() || pagamento.pessoa_id;
    const telefone = pessoa.telefone?.trim();
    const cabecalho = telefone ? `—— ${nome} · ${telefone} ——` : `—— ${nome} ——`;
    blocos.push(`${cabecalho}\n${texto}`);
  }
  return blocos.join("\n\n==========\n\n");
}

/** Chave PIX cadastrada na pessoa (trim); undefined se vazia. */
export function chavePixDaPessoa(pessoa?: PessoaRH): string | undefined {
  const chave = (pessoa?.chave_pix ?? "").trim();
  return chave || undefined;
}

/**
 * Bloco legível para colar no banco (cabeçalho + chave).
 * Não altera status — só monta texto.
 */
export function montarTextoPixPagamento(input: {
  pessoa: PessoaRH;
  pagamento: PagamentoPessoa;
}): string | undefined {
  const chave = chavePixDaPessoa(input.pessoa);
  if (!chave) return undefined;
  const nome = input.pessoa.nome.trim() || "Pessoa";
  const tipo = rotuloTipoPagamentoPessoa(input.pagamento.tipo);
  const valor = moeda(input.pagamento.pagamento_valor ?? input.pagamento.valor);
  return `—— ${nome} · ${tipo} · ${valor} ——\n${chave}`;
}

/**
 * Concatena chaves PIX de vários pagamentos com cabeçalho por pessoa.
 * Omite quem não tem chave. Não altera status.
 */
export function montarTextosPixPagamentosLote(
  pagamentos: PagamentoPessoa[],
  opts: { pessoaPorId: (id: string) => PessoaRH | undefined }
): string {
  const blocos: string[] = [];
  for (const pagamento of pagamentos) {
    const pessoa = opts.pessoaPorId(pagamento.pessoa_id);
    if (!pessoa) continue;
    const bloco = montarTextoPixPagamento({ pessoa, pagamento });
    if (!bloco) continue;
    blocos.push(bloco);
  }
  return blocos.join("\n\n==========\n\n");
}

/** Monta link wa.me com texto do recibo/confirmação (DDI 55). */
export function linkWhatsAppReciboPagamento(
  telefone: string | undefined,
  texto: string
): string | null {
  const digitos = somenteDigitosTelefone(telefone ?? "");
  if (!digitos) return null;
  const comDdi = digitos.startsWith("55") ? digitos : `55${digitos}`;
  return `https://wa.me/${comDdi}?text=${encodeURIComponent(texto)}`;
}
