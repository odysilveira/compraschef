"use client";

import Link from "next/link";
import { useState } from "react";
import { useParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Badge, Card, TituloPagina, Vazio } from "@/components/ui";
import { useDB } from "@/lib/data";
import { dataHoraBR } from "@/lib/format";
import {
  listarItensCatalogoFichasTecnicas,
  rotuloStatusFichaTecnica,
  rotuloTipoReceitaFichaTecnica,
} from "@/lib/domain/fichas-tecnicas-catalogo";
import { criarRepositorioFichasTecnicasLocal } from "@/lib/domain/fichas-tecnicas-repositorio-local";
import type { FichaTecnicaStatus } from "@/lib/types";

function corStatus(status: FichaTecnicaStatus): "cinza" | "verde" | "laranja" {
  if (status === "publicada") return "verde";
  if (status === "arquivada") return "laranja";
  return "cinza";
}

export default function FichaTecnicaDetalhePage() {
  const params = useParams<{ receitaId: string }>();
  const db = useDB();
  const [repo] = useState(() => criarRepositorioFichasTecnicasLocal());

  const item = listarItensCatalogoFichasTecnicas(repo, db.categorias_produtos).find((receita) => receita.id === params?.receitaId);

  if (!item) {
    return (
      <div className="space-y-4">
        <TituloPagina
          titulo="Ficha técnica"
          subtitulo="A ficha solicitada não foi encontrada no catálogo atual."
          acao={
            <Link href="/fichas-tecnicas" className="btn-secundario">
              <ArrowLeft className="h-4 w-4" /> Voltar ao catálogo
            </Link>
          }
        />
        <Vazio mensagem="Nenhuma ficha técnica encontrada com este identificador." />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <TituloPagina
        titulo={item.nome}
        subtitulo="Visão inicial da ficha criada no catálogo. A edição completa entra nas próximas etapas."
        acao={
          <Link href="/fichas-tecnicas" className="btn-secundario">
            <ArrowLeft className="h-4 w-4" /> Voltar ao catálogo
          </Link>
        }
      />

      <Card className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge cor={corStatus(item.status)}>{rotuloStatusFichaTecnica(item.status)}</Badge>
          <Badge cor="azul">{rotuloTipoReceitaFichaTecnica(item.tipo)}</Badge>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <p className="rotulo">Código</p>
            <p className="font-semibold">{item.codigo}</p>
          </div>
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
          <div>
            <p className="rotulo">Categoria</p>
            <p className="font-semibold">{item.categoria_nome ?? "Não definida"}</p>
          </div>
        </div>

        <div>
          <p className="rotulo">Descrição</p>
          <p className="text-sm text-stone-700">{item.descricao?.trim() ? item.descricao : "Nenhuma descrição informada neste rascunho."}</p>
        </div>
      </Card>

      <Card>
        <p className="text-sm text-stone-600">
          Este rascunho básico já usa o repositório canônico de fichas técnicas. Ingredientes, passos,
          publicação, custos e porcionamento continuam fora do escopo desta etapa 2A.
        </p>
      </Card>
    </div>
  );
}