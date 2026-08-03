"use client";

// Moldura do app no estilo do ERP parceiro (EASE EAT): menu lateral branco com
// seções agrupadas, busca no topo, usuário no rodapé e barra superior fina.

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  FileSpreadsheet,
  MessagesSquare,
  ShoppingCart,
  PackageCheck,
  Boxes,
  Wallet,
  BarChart3,
  FolderCog,
  Menu,
  X,
  ChefHat,
  ChevronLeft,
  ChevronRight,
  Search,
  Users,
  WalletCards,
  UtensilsCrossed,
  CalendarDays,
  Fingerprint,
  Scale,
} from "lucide-react";
import { PapelProvider, usePapel, usePermissoes, ROTULO_PAPEL } from "@/lib/roles";
import { useDB } from "@/lib/data";
import { moduloDaRota, podeAcessarModulo } from "@/lib/domain/acesso";
import type { ModuloAcesso, Papel } from "@/lib/types";

interface ItemMenu {
  href: string;
  rotulo: string;
  icone: React.ComponentType<{ size?: number | string; className?: string }>;
  modulo: ModuloAcesso;
}

interface SecaoMenu {
  titulo: string;
  itens: ItemMenu[];
}

const MENU: SecaoMenu[] = [
  {
    titulo: "Operação",
    itens: [
      { href: "/", rotulo: "Painel", icone: LayoutDashboard, modulo: "painel" },
      { href: "/recebimento", rotulo: "Recebimento", icone: PackageCheck, modulo: "recebimento" },
      { href: "/estoque", rotulo: "Estoque", icone: Boxes, modulo: "estoque" },
    ],
  },
  {
    titulo: "Suprimentos",
    itens: [
      { href: "/lista-compras", rotulo: "Lista de compras", icone: FileSpreadsheet, modulo: "lista_compras" },
      { href: "/cotacoes", rotulo: "Cotações", icone: MessagesSquare, modulo: "cotacoes" },
      { href: "/pedidos", rotulo: "Pedidos", icone: ShoppingCart, modulo: "pedidos" },
    ],
  },
  {
    titulo: "Financeiro",
    itens: [
      { href: "/financeiro", rotulo: "Boletos e contas", icone: Wallet, modulo: "financeiro" },
      { href: "/relatorios", rotulo: "Relatórios", icone: BarChart3, modulo: "relatorios" },
    ],
  },
  {
    titulo: "RH",
    itens: [
      { href: "/rh", rotulo: "Pessoas", icone: Users, modulo: "rh" },
      { href: "/rh/pagamentos", rotulo: "Pagamentos", icone: WalletCards, modulo: "rh" },
      { href: "/rh/consumos", rotulo: "Consumos", icone: UtensilsCrossed, modulo: "rh" },
      { href: "/rh/escala", rotulo: "Escala", icone: CalendarDays, modulo: "rh" },
      { href: "/rh/ponto", rotulo: "Ponto", icone: Fingerprint, modulo: "rh" },
      { href: "/rh/normas", rotulo: "Normas", icone: Scale, modulo: "rh" },
    ],
  },
  {
    titulo: "Sistema",
    itens: [{ href: "/cadastros", rotulo: "Cadastros", icone: FolderCog, modulo: "cadastros" }],
  },
];

function MarcaComprasChef() {
  return (
    <Link href="/" className="flex items-center gap-2.5 px-1">
      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primaria text-white">
        <ChefHat size={20} />
      </span>
      <span className="leading-tight">
        <span className="block text-[15px] font-bold">
          Compras<span className="text-primaria-escura">Chef</span>
        </span>
        <span className="block text-[11px] text-stone-500">Compras &amp; Estoque</span>
      </span>
    </Link>
  );
}

function RodapeUsuario() {
  const { papel, setPapel } = usePapel();
  const db = useDB();
  const perfil = db.perfis.find((p) => p.papel === papel);
  const nome = perfil?.nome ?? "—";

  return (
    <div className="border-t border-stone-200 p-3">
      <div className="flex items-center gap-2.5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primaria-clara text-sm font-bold text-primaria-escura">
          {nome.charAt(0).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{nome}</p>
          <select
            value={papel}
            onChange={(e) => setPapel(e.target.value as Papel)}
            className="mt-0.5 w-full cursor-pointer rounded border-0 bg-transparent p-0 text-xs text-stone-500 focus:ring-0"
            aria-label="Entrando como"
          >
            {(Object.keys(ROTULO_PAPEL) as Papel[]).map((p) => (
              <option key={p} value={p}>
                {ROTULO_PAPEL[p]}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}

function Navegacao({ aoNavegar }: { aoNavegar?: () => void }) {
  const pathname = usePathname();
  const perms = usePermissoes();
  const [busca, setBusca] = useState("");

  const secoes = MENU.map((secao) => ({
    ...secao,
    itens: secao.itens
      .filter((i) => podeAcessarModulo(perms, i.modulo))
      .filter((i) => i.rotulo.toLowerCase().includes(busca.trim().toLowerCase())),
  })).filter((secao) => secao.itens.length > 0);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="relative px-3 pb-1 pt-3">
        <Search size={14} className="pointer-events-none absolute left-6 top-1/2 mt-1 -translate-y-1/2 text-stone-400" />
        <input
          type="search"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar…"
          className="w-full rounded-lg border border-stone-200 bg-stone-50 py-1.5 pl-8 pr-2 text-sm outline-none focus:border-primaria focus:bg-white"
        />
      </div>
      <nav className="flex-1 overflow-y-auto px-3 py-2">
        {secoes.map((secao) => (
          <div key={secao.titulo} className="mb-3">
            <p className="rotulo px-2 pb-1 pt-2">{secao.titulo}</p>
            {secao.itens.map((item) => {
              const ativo = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
              const Icone = item.icone;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={aoNavegar}
                  className={`mb-0.5 flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors ${
                    ativo
                      ? "bg-primaria-clara font-semibold text-primaria-escura"
                      : "font-medium text-stone-600 hover:bg-stone-100"
                  }`}
                >
                  <Icone size={17} className={ativo ? "text-primaria-escura" : "text-stone-400"} />
                  <span className="flex-1">{item.rotulo}</span>
                  {ativo && <ChevronRight size={15} />}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
      <RodapeUsuario />
    </div>
  );
}

function BarraSuperior({ onAbrirMenu }: { onAbrirMenu: () => void }) {
  const router = useRouter();
  return (
    <header className="sticky top-0 z-40 flex items-center gap-2 border-b border-stone-200 bg-superficie px-3 py-2">
      <button
        className="rounded-lg p-2 hover:bg-stone-100 lg:hidden"
        onClick={onAbrirMenu}
        aria-label="Abrir menu"
      >
        <Menu size={20} />
      </button>
      <button
        className="hidden rounded-lg p-1.5 text-stone-500 hover:bg-stone-100 lg:block"
        onClick={() => router.back()}
        aria-label="Voltar"
      >
        <ChevronLeft size={18} />
      </button>
      <span className="flex items-center gap-1.5 rounded-lg bg-stone-900 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-white">
        <ChefHat size={13} />
        ComprasChef
      </span>
    </header>
  );
}

function ConteudoProtegido({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const perms = usePermissoes();
  const modulo = moduloDaRota(pathname);

  if (modulo && !podeAcessarModulo(perms, modulo)) {
    return (
      <div className="mx-auto max-w-lg py-10 text-center">
        <p className="text-lg font-bold text-slate-900">Sem permissão</p>
        <p className="mt-2 text-sm text-slate-600">
          Este módulo não está liberado para o perfil atual. Peça ao dono/gerente para autorizar em RH →
          pessoa → Acesso.
        </p>
        <Link href="/" className="btn-primario mt-4 inline-flex">
          Voltar ao painel
        </Link>
      </div>
    );
  }

  return <>{children}</>;
}

function Moldura({ children }: { children: React.ReactNode }) {
  const [menuAberto, setMenuAberto] = useState(false);

  return (
    <div className="flex min-h-screen">
      {/* Menu lateral fixo (desktop) */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-stone-200 bg-superficie lg:flex">
        <div className="border-b border-stone-200 px-3 py-3">
          <MarcaComprasChef />
        </div>
        <Navegacao />
      </aside>

      {/* Menu lateral deslizante (celular/tablet) */}
      {menuAberto && (
        <div className="fixed inset-0 z-50 lg:hidden" onClick={() => setMenuAberto(false)}>
          <div className="absolute inset-0 bg-black/40" />
          <div
            className="absolute left-0 top-0 flex h-full w-72 flex-col bg-superficie shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-stone-200 px-3 py-3">
              <MarcaComprasChef />
              <button onClick={() => setMenuAberto(false)} className="rounded-lg p-2 hover:bg-stone-100" aria-label="Fechar menu">
                <X size={20} />
              </button>
            </div>
            <Navegacao aoNavegar={() => setMenuAberto(false)} />
          </div>
        </div>
      )}

      {/* Conteúdo */}
      <div className="flex min-w-0 flex-1 flex-col">
        <BarraSuperior onAbrirMenu={() => setMenuAberto(true)} />
        <main className="min-w-0 flex-1 p-4 lg:p-6">
          <ConteudoProtegido>{children}</ConteudoProtegido>
        </main>
      </div>
    </div>
  );
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <PapelProvider>
      <Moldura>{children}</Moldura>
    </PapelProvider>
  );
}
