"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { BookOpenText, Plus, Search } from "lucide-react";
import { Badge, Campo, Card, Modal, TituloPagina, Vazio } from "@/components/ui";
import { useDB } from "@/lib/data";
import { dataHoraBR } from "@/lib/format";
import {
  criarCoordenadorNovoRascunhoFichaTecnica,
  criarFormularioNovoRascunhoInicial,
  filtrarItensCatalogoFichasTecnicas,
  listarItensCatalogoFichasTecnicas,
  rotuloStatusFichaTecnica,
  rotuloTipoReceitaFichaTecnica,
  selecionarUnidadePadraoRascunho,
  type FormNovoRascunhoFichaTecnica,
} from "@/lib/domain/fichas-tecnicas-catalogo";
import { criarRepositorioFichasTecnicasLocal } from "@/lib/domain/fichas-tecnicas-repositorio-local";
import type { FichaTecnicaStatus, TipoReceitaFichaTecnica } from "@/lib/types";

function corStatus(status: FichaTecnicaStatus): "cinza" | "verde" | "laranja" {
  if (status === "publicada") return "verde";
  if (status === "arquivada") return "laranja";
  return "cinza";
}

export default function FichasTecnicasPage() {
  const db = useDB();
  const [repo] = useState(() => criarRepositorioFichasTecnicasLocal());
  const coordenadorRef = useRef<{
    unidadeId: string;
    criadoPor: string;
    coordenador: ReturnType<typeof criarCoordenadorNovoRascunhoFichaTecnica>;
  } | null>(null);

  const [busca, setBusca] = useState("");
  const [filtroTipo, setFiltroTipo] = useState<"todos" | TipoReceitaFichaTecnica>("todos");
  const [filtroStatus, setFiltroStatus] = useState<"todos" | FichaTecnicaStatus>("todos");
  const [modalAberto, setModalAberto] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erroFormulario, setErroFormulario] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [formulario, setFormulario] = useState<FormNovoRascunhoFichaTecnica>(criarFormularioNovoRascunhoInicial);

  const categorias = [...db.categorias_produtos].filter((categoria) => categoria.ativo).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  const itens = listarItensCatalogoFichasTecnicas(repo, categorias);
  const itensFiltrados = filtrarItensCatalogoFichasTecnicas(itens, {
    busca,
    tipo: filtroTipo,
    status: filtroStatus,
  });

  function obterCoordenador() {
    const unidadeId = selecionarUnidadePadraoRascunho(db.unidades);
    const criadoPor = "interface-local";
    if (
      !coordenadorRef.current ||
      coordenadorRef.current.unidadeId !== unidadeId ||
      coordenadorRef.current.criadoPor !== criadoPor
    ) {
      coordenadorRef.current = {
        unidadeId,
        criadoPor,
        coordenador: criarCoordenadorNovoRascunhoFichaTecnica({
          repositorio: repo,
          criado_por: criadoPor,
          rendimento_unidade_id: unidadeId,
        }),
      };
    }

    return coordenadorRef.current.coordenador;
  }

  function abrirModal() {
    setErroFormulario(null);
    setAviso(null);
    setFormulario(criarFormularioNovoRascunhoInicial());
    setModalAberto(true);
  }

  function fecharModal() {
    if (salvando) {
      return;
    }
    const coordenador = obterCoordenador();
    setFormulario(coordenador.cancelar());
    setErroFormulario(null);
    setModalAberto(false);
  }

  async function salvarNovoRascunho(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSalvando(true);
    setErroFormulario(null);
    setAviso(null);

    try {
      const coordenador = obterCoordenador();
      const resultado = await coordenador.salvar(formulario);
      setFormulario(coordenador.cancelar());
      setModalAberto(false);
      setAviso(`Rascunho ${resultado.receita.codigo} criado com sucesso.`);
    } catch (error) {
      setErroFormulario(error instanceof Error ? error.message : "Não foi possível criar a ficha técnica.");
    } finally {
      setSalvando(false);
    }
  }

  const vazioBase = itens.length === 0;

  return (
    <div className="space-y-4">
      <TituloPagina
        titulo="Fichas técnicas"
        subtitulo="Catálogo inicial de receitas e sub-receitas com criação rápida de rascunho básico."
        acao={
          <button className="btn-primario" onClick={abrirModal}>
            <Plus className="h-4 w-4" /> Nova ficha
          </button>
        }
      />

      {aviso && <p className="rounded-card bg-sucesso-clara px-4 py-3 text-sm font-medium text-primaria-escura">{aviso}</p>}

      <Card className="space-y-4">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1.5fr)_220px_220px]">
          <label className="block">
            <span className="rotulo mb-1 block">Busca por nome ou código</span>
            <div className="relative">
              <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
              <input
                type="search"
                className="campo pl-9"
                placeholder="Ex.: molho, FT-001"
                value={busca}
                onChange={(event) => setBusca(event.target.value)}
              />
            </div>
          </label>

          <Campo rotulo="Tipo">
            <select className="campo" value={filtroTipo} onChange={(event) => setFiltroTipo(event.target.value as "todos" | TipoReceitaFichaTecnica)}>
              <option value="todos">Todos</option>
              <option value="prato">Prato</option>
              <option value="sub_receita">Sub-receita</option>
            </select>
          </Campo>

          <Campo rotulo="Status">
            <select className="campo" value={filtroStatus} onChange={(event) => setFiltroStatus(event.target.value as "todos" | FichaTecnicaStatus)}>
              <option value="todos">Todos</option>
              <option value="rascunho">Rascunho</option>
              <option value="publicada">Publicada</option>
              <option value="arquivada">Arquivada</option>
            </select>
          </Campo>
        </div>
      </Card>

      {vazioBase ? (
        <Vazio mensagem="Nenhuma ficha técnica cadastrada ainda. Crie um rascunho básico para começar o catálogo." />
      ) : itensFiltrados.length === 0 ? (
        <Vazio mensagem="Nenhuma ficha corresponde aos filtros atuais." />
      ) : (
        <div className="space-y-3">
          {itensFiltrados.map((item) => (
            <Card key={item.id} className="space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-lg font-bold text-stone-900">{item.nome}</h2>
                    <Badge cor={corStatus(item.status)}>{rotuloStatusFichaTecnica(item.status)}</Badge>
                    <Badge cor="azul">{rotuloTipoReceitaFichaTecnica(item.tipo)}</Badge>
                  </div>
                  <p className="mt-1 text-sm text-stone-500">
                    Código {item.codigo}
                    {item.categoria_nome ? ` · Categoria ${item.categoria_nome}` : ""}
                  </p>
                  {item.descricao && <p className="mt-2 text-sm text-stone-700">{item.descricao}</p>}
                </div>

                <Link href={`/fichas-tecnicas/${item.id}`} className="btn-secundario whitespace-nowrap">
                  <BookOpenText className="h-4 w-4" /> Abrir ficha
                </Link>
              </div>

              <div className="grid gap-3 text-sm sm:grid-cols-3 lg:grid-cols-4">
                <div>
                  <p className="rotulo">Versão atual</p>
                  <p className="font-semibold">{item.versao_atual ?? "—"}</p>
                </div>
                <div>
                  <p className="rotulo">Última atualização</p>
                  <p className="font-semibold">{dataHoraBR(item.atualizado_em)}</p>
                </div>
                <div>
                  <p className="rotulo">Tipo</p>
                  <p className="font-semibold">{rotuloTipoReceitaFichaTecnica(item.tipo)}</p>
                </div>
                <div>
                  <p className="rotulo">Status</p>
                  <p className="font-semibold">{rotuloStatusFichaTecnica(item.status)}</p>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal aberto={modalAberto} titulo="Nova ficha técnica" onFechar={fecharModal} fecharAoClicarFundo={!salvando}>
        <form className="space-y-4" onSubmit={salvarNovoRascunho}>
          <Campo rotulo="Nome *">
            <input
              className="campo"
              value={formulario.nome}
              onChange={(event) => setFormulario((atual) => ({ ...atual, nome: event.target.value }))}
              placeholder="Ex.: Lasanha bolonhesa"
            />
          </Campo>

          <Campo rotulo="Código *">
            <input
              className="campo"
              value={formulario.codigo}
              onChange={(event) => setFormulario((atual) => ({ ...atual, codigo: event.target.value }))}
              placeholder="Ex.: FT-001"
            />
          </Campo>

          <Campo rotulo="Tipo">
            <select
              className="campo"
              value={formulario.tipo}
              onChange={(event) => setFormulario((atual) => ({ ...atual, tipo: event.target.value as TipoReceitaFichaTecnica }))}
            >
              <option value="prato">Prato</option>
              <option value="sub_receita">Sub-receita</option>
            </select>
          </Campo>

          {categorias.length > 0 && (
            <Campo rotulo="Categoria">
              <select
                className="campo"
                value={formulario.categoria_id}
                onChange={(event) => setFormulario((atual) => ({ ...atual, categoria_id: event.target.value }))}
              >
                <option value="">Sem categoria</option>
                {categorias.map((categoria) => (
                  <option key={categoria.id} value={categoria.id}>
                    {categoria.nome}
                  </option>
                ))}
              </select>
            </Campo>
          )}

          <Campo rotulo="Descrição">
            <textarea
              className="campo min-h-24"
              value={formulario.descricao}
              onChange={(event) => setFormulario((atual) => ({ ...atual, descricao: event.target.value }))}
              placeholder="Resumo opcional para localizar a ficha no catálogo."
            />
          </Campo>

          {erroFormulario && <p className="rounded-card bg-erro-clara px-3 py-2 text-sm font-medium text-erro">{erroFormulario}</p>}

          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" className="btn-secundario" onClick={fecharModal} disabled={salvando}>
              Cancelar
            </button>
            <button type="submit" className="btn-primario" disabled={salvando}>
              {salvando ? "Salvando..." : "Criar rascunho"}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}