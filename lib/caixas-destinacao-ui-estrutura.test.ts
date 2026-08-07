import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const fonte = readFileSync(join(process.cwd(), "components/cadastros/AbaCaixas.tsx"), "utf8");

describe("interface de destinacao operacional em caixas", () => {
  it("mostra ativacao apenas para Operacional vazio sem destino ativo", () => {
    expect(fonte).toContain('form.tipo_box === "OPERACIONAL"');
    expect(fonte).toContain("operacionalVazioSemAlocacao");
    expect(fonte).toContain("!form?.produto_operacional_alvo_id");
    expect(fonte).toContain("Ativar destina");
    expect(fonte).toContain("Pesquisar produto/porcionamento");
    expect(fonte).toContain("produtos-destinacao-operacional");
  });

  it("nao oferece destinacao operacional para Reserva, Quarentena ou Nao Classificado", () => {
    expect(fonte).not.toContain('form.tipo_box !== "QUARENTENA" &&');
    expect(fonte).not.toContain('form.tipo_box === "RESERVA" && ativarDestinacao');
    expect(fonte).not.toContain('form.tipo_box === "QUARENTENA" && ativarDestinacao');
    expect(fonte).not.toContain('form.tipo_box === "NAO_CLASSIFICADO" && ativarDestinacao');
    expect(fonte).not.toContain("produto_id como substituto");
  });

  it("chama somente o dominio para ativar ou encerrar e nao grava alvo diretamente na UI", () => {
    expect(fonte).toContain("ativarDestinacaoOperacional(banco");
    expect(fonte).toContain("encerrarDestinacaoOperacional(banco");
    expect(fonte).not.toMatch(/produto_operacional_alvo_id\s*=/);
    expect(fonte).not.toMatch(/produto_id\s*=\s*produtoAlvoId/);
  });

  it("exibe destinacao ativa sem permitir troca direta e com produto, unidade, numero e QR", () => {
    expect(fonte).toContain("Destinação ativa para");
    expect(fonte).toContain("siglaUnidadeUso(db, form.produto_operacional_alvo_id)");
    expect(fonte).toContain("Número permanente");
    expect(fonte).toContain("QR permanente");
    expect(fonte).toContain("disabled={Boolean(form.produto_operacional_alvo_id)}");
    expect(fonte).toContain("Fechar o box com saldo zero não encerra a destinação automaticamente");
  });

  it("formata inicio da destinacao sem expor timestamp ISO bruto", () => {
    expect(fonte).toContain("dataHoraBR(form.destinacao_operacional_inicio_em)");
    expect(fonte).not.toContain('value={form.destinacao_operacional_inicio_em ??');
    expect(fonte).not.toContain("2026-08-04T18:37:30.235Z");
  });

  it("mantem textos principais com acentuacao correta sem alterar identificadores internos", () => {
    expect(fonte).toContain("Destinação operacional");
    expect(fonte).toContain("Responsável pela ativação");
    expect(fonte).toContain("Higienização confirmada");
    expect(fonte).toContain("Confirmação final");
    expect(fonte).toContain("Encerrar destinação");
    expect(fonte).toContain("Sem destinação — configure antes da operação.");
    expect(fonte).toContain("produto_operacional_alvo_id");
    expect(fonte).toContain("destinacao_operacional_inicio_em");
  });

  it("encerramento exige motivo, higienizacao, confirmacao e bloqueia saldo ou alocacao", () => {
    expect(fonte).toContain("motivoDestinacao.trim().length > 0");
    expect(fonte).toContain("higienizacaoConfirmada");
    expect(fonte).toContain("confirmacaoEncerramento");
    expect(fonte).toContain("Encerramento bloqueado: exige saldo físico zero.");
    expect(fonte).toContain("Encerramento bloqueado: existe alocação ativa.");
  });

  it("persistencia passa pelo repositorio local ja utilizado pelo projeto", () => {
    expect(fonte).toContain("mutate((banco) =>");
    expect(fonte).toContain("caixaAtualizada = banco.caixas.find");
    expect(fonte).toContain("if (caixaAtualizada) abrirFormulario(caixaAtualizada)");
  });

  it("expõe local físico existente e bloqueia alteração silenciosa com conteúdo ou alocação", () => {
    expect(fonte).toContain('Campo rotulo="Local físico"');
    expect(fonte).toContain("db.locais.map");
    expect(fonte).toContain("podeAlterarLocalFisico");
    expect(fonte).toContain("saldoFisicoForm === 0 && !alocacaoAtivaForm");
    expect(fonte).toContain("local_id: form.local_id");
    expect(fonte).toContain("Alteração de local físico bloqueada");
  });

  it("nova ativação de destinação exige local físico definido", () => {
    expect(fonte).toContain("Boolean(form?.local_id)");
    expect(fonte).toContain("Local físico não definido — configure o box antes da operação.");
  });
});
