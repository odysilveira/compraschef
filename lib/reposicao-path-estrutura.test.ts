import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

function listarArquivosRecursivo(diretorio: string): string[] {
  const saida: string[] = [];
  const entradas = readdirSync(diretorio, { withFileTypes: true });
  for (const entrada of entradas) {
    const absoluto = path.join(diretorio, entrada.name);
    if (entrada.isDirectory()) {
      saida.push(...listarArquivosRecursivo(absoluto));
      continue;
    }
    if (entrada.isFile()) {
      saida.push(absoluto);
    }
  }
  return saida;
}

function expectTextoVisivel(fonte: string, texto: string, textoLegado: string): void {
  expect(fonte.includes(texto) || fonte.includes(textoLegado)).toBe(true);
}

describe("estrutura da rota reposicao", () => {
  const raizReposicao = path.join(process.cwd(), "app", "(sistema)", "estoque", "reposicao");
  const pageTsx = path.join(raizReposicao, "page.tsx");

  it("page.tsx é arquivo", () => {
    const stats = statSync(pageTsx);
    expect(stats.isFile()).toBe(true);
  });

  it("page.tsx não é diretório", () => {
    const stats = statSync(pageTsx);
    expect(stats.isDirectory()).toBe(false);
  });

  it("existe exatamente um page.tsx abaixo de reposicao", () => {
    const arquivos = listarArquivosRecursivo(raizReposicao);
    const pages = arquivos.filter((arquivo) => path.basename(arquivo).toLowerCase() === "page.tsx");
    expect(pages).toHaveLength(1);
    expect(path.normalize(pages[0])).toBe(path.normalize(pageTsx));
  });

  it("separa previa manual de confirmacao fisica nas tres abas", () => {
    const fonte = readFileSync(pageTsx, "utf8");
    expectTextoVisivel(fonte, "Box localizado — leitura física do QR ainda pendente.", "Box localizado — leitura física do QR ainda pendente.");
    expectTextoVisivel(fonte, "QR digitado — não confirmado", "QR digitado — não confirmado");
    expectTextoVisivel(fonte, "QR não encontrado.", "QR não encontrado.");
    expect(fonte).toContain("onManual={localizarManualAbertura}");
    expect(fonte).toContain('onManual={(qr) => localizarManualReposicao(qr, "origem")}');
    expect(fonte).toContain('onManual={(qr) => localizarManualReposicao(qr, "destino")}');
    expect(fonte).toContain("onManual={localizarManualFechamento}");
  });

  it("previa manual nao habilita operacoes nem cria confirmacao fisica", () => {
    const fonte = readFileSync(pageTsx, "utf8");
    expect(fonte).toContain('disabled={!aberturaConfirmacao || aberturaSemLocalFisico}');
    expect(fonte).toContain('disabled={!reposicaoConfirmacaoOrigem || !reposicaoConfirmacaoDestino || !reposicaoCompativel || !quantidadeReposicaoValida || reposicaoDestinoSemLocalFisico || reposicaoTemBloqueioPapel}');
    expect(fonte).toContain('disabled={!fechamentoConfirmacao || fechamentoSemLocalFisico}');
    expect(fonte).toContain("resolverPreviaManualBox(db");
    expect(fonte).toContain("sincronizarDBLocalSalvo()");
    expectTextoVisivel(fonte, 'setErroAbertura(previa.localizado ? null : "QR não encontrado.")', 'setErroAbertura(previa.localizado ? null : "QR não encontrado.")');
    expect(fonte).toContain("setAberturaConfirmacao(undefined)");
    expect(fonte).toContain("setReposicaoConfirmacaoOrigem(undefined)");
    expect(fonte).toContain("setReposicaoConfirmacaoDestino(undefined)");
    expect(fonte).toContain("setFechamentoConfirmacao(undefined)");
  });

  it("leitura fisica continua confirmando e edicao posterior invalida", () => {
    const fonte = readFileSync(pageTsx, "utf8");
    expect(fonte).toContain('setAberturaOrigemEntrada("leitura")');
    expect(fonte).toContain('setFechamentoOrigemEntrada("leitura")');
    expect(fonte).toContain("criarConfirmacaoQr(db, aberturaSessaoId, qr)");
    expect(fonte).toContain("criarConfirmacaoQr(db, reposicaoSessaoId, qr)");
    expect(fonte).toContain("normalizarQr(confirmacao.qr_confirmado) !== qr");
    expectTextoVisivel(fonte, "inválido ou alterado após leitura", "inválido ou alterado após leitura");
  });

  it("mostra previa operacional completa da reposicao", () => {
    const fonte = readFileSync(pageTsx, "utf8");
    expectTextoVisivel(fonte, "Origem — Box Reserva", "Origem — Box Reserva");
    expectTextoVisivel(fonte, "Destino — Box Operacional", "Destino — Box Operacional");
    expectTextoVisivel(fonte, "Saldo disponível", "Saldo disponível");
    expect(fonte).toContain("Lote");
    expect(fonte).toContain("Validade");
    expectTextoVisivel(fonte, "Localização", "Localização");
    expectTextoVisivel(fonte, "Posição física", "Posição física");
    expect(fonte).toContain("Status da leitura");
    expectTextoVisivel(fonte, "Destinação ativa", "Destinação ativa");
    expect(fonte).toContain("Saldo projetado");
    expectTextoVisivel(fonte, "Compatível", "Compatível");
    expectTextoVisivel(fonte, "Incompatível", "Incompatível");
  });

  it("mostra avisos explicitos para papel incorreto na previa da reposicao", () => {
    const fonte = readFileSync(pageTsx, "utf8");
    expect(fonte).toContain("reposicaoAvisosPapel");
    expect(fonte).toContain("reposicaoTemBloqueioPapel");
    expect(fonte).toContain("Origem inválida — este box é Operacional. Leia um Box Reserva.");
    expect(fonte).toContain("Destino inválido — este box é Reserva. Leia um Box Operacional.");
    expect(fonte).toContain("Box em Quarentena — movimentação bloqueada.");
    expect(fonte).toContain("Origem e destino não podem ser o mesmo box.");
    expect(fonte).toContain("|| reposicaoTemBloqueioPapel");
  });

  it("mostra saldos projetados, bloqueia quantidade invalida e detalha FEFO", () => {
    const fonte = readFileSync(pageTsx, "utf8");
    expect(fonte).toContain("Quantidade a transferir");
    expect(fonte).toContain("Reserva depois");
    expect(fonte).toContain("Operacional depois");
    expectTextoVisivel(fonte, "Quantidade maior que o saldo disponível da origem.", "Quantidade maior que o saldo disponível da origem.");
    expect(fonte).toContain("passoReposicao");
    expect(fonte).toContain("casasDecimaisReposicao");
    expect(fonte).toContain("Reserva FEFO");
    expect(fonte).toContain("Motivo da prioridade FEFO");
    expect(fonte).toContain("!reposicaoCompativel || !quantidadeReposicaoValida");
  });

  it("fechamento usa produto efetivo e unidade da destinacao ativa", () => {
    const fonte = readFileSync(pageTsx, "utf8");
    expect(fonte).toContain("const fechamentoProdutoId = fechamentoBox ? produtoOperacionalEfetivo(fechamentoBox) : undefined;");
    expect(fonte).toContain("const fechamentoUnidade = fechamentoProdutoId ? siglaUnidadeUso(db, fechamentoProdutoId) : undefined;");
    expect(fonte).toContain("Produto/porcionamento: {fechamentoProdutoId ? nomeProduto(db, fechamentoProdutoId)");
    expect(fonte).toContain("Quantidade física restante${fechamentoUnidade");
    expect(fonte).toContain("qtd(fechamentoEsperado, fechamentoUnidade)");
    expect(fonte).toContain("qtd(fechamentoContado, fechamentoUnidade)");
    expect(fonte).not.toContain("fechamentoBox?.produto_id");
    expect(fonte).not.toContain("fechamentoBox.produto_id");
  });

  it("mostra aviso de local fisico ausente sem liberar operacao real", () => {
    const fonte = readFileSync(pageTsx, "utf8");
    expect(fonte).toContain("aberturaSemLocalFisico");
    expect(fonte).toContain("reposicaoDestinoSemLocalFisico");
    expect(fonte).toContain("fechamentoSemLocalFisico");
    expect(fonte).toContain("Local físico não definido — configure o box antes da operação.");
  });
});
