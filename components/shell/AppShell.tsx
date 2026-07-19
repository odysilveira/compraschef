"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
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
} from "lucide-react";
import { PapelProvider, usePapel, podeVerValores, ROTULO_PAPEL } from "@/lib/roles";
import type { Papel } from "@/lib/types";

interface ItemMenu {
  href: string;
  rotulo: string;
  icone: React.ComponentType<{ size?: number | string; className?: string }>;
  precisaVerValores?: boolean;
}

const MENU: ItemMenu[] = [
  { href: "/", rotulo: "Painel", icone: LayoutDashboard },
  { href: "/lista-compras", rotulo: "Lista de compras", icone: FileSpreadsheet },
  { href: "/cotacoes", rotulo: "Cotações", icone: MessagesSquare, precisaVerValores: true },
  { href: "/pedidos", rotulo: "Pedidos", icone: ShoppingCart },
  { href: "/recebimento", rotulo: "Recebimento", icone: PackageCheck },
  { href: "/estoque", rotulo: "Estoque", icone: Boxes },
  { href: "/financeiro", rotulo: "Financeiro", icone: Wallet, precisaVerValores: true },
  { href: "/relatorios", rotulo: "Relatórios", icone: BarChart3, precisaVerValores: true },
  { href: "/cadastros", rotulo: "Cadastros", icone: FolderCog },
];

function SeletorPapel() {
  const { papel, setPapel } = usePapel();
  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="hidden text-slate-500 sm:inline">Entrando como:</span>
      <select
        value={papel}
        onChange={(e) => setPapel(e.target.value as Papel)}
        className="rounded-card border border-slate-300 bg-superficie px-2 py-1.5 text-sm font-medium"
      >
        {(Object.keys(ROTULO_PAPEL) as Papel[]).map((p) => (
          <option key={p} value={p}>
            {ROTULO_PAPEL[p]}
          </option>
        ))}
      </select>
    </label>
  );
}

function Navegacao({ aoNavegar }: { aoNavegar?: () => void }) {
  const pathname = usePathname();
  const { papel } = usePapel();
  const itens = MENU.filter((i) => !i.precisaVerValores || podeVerValores(papel));

  return (
    <nav className="flex flex-col gap-1 p-3">
      {itens.map((item) => {
        const ativo = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
        const Icone = item.icone;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={aoNavegar}
            className={`flex items-center gap-3 rounded-card px-3 py-2.5 text-sm font-medium transition-colors ${
              ativo ? "bg-primaria text-white" : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            <Icone size={18} />
            {item.rotulo}
          </Link>
        );
      })}
    </nav>
  );
}

function Moldura({ children }: { children: React.ReactNode }) {
  const [menuAberto, setMenuAberto] = useState(false);

  return (
    <div className="min-h-screen">
      {/* Topo */}
      <header className="sticky top-0 z-40 flex items-center justify-between gap-3 border-b border-slate-200 bg-superficie px-4 py-3">
        <div className="flex items-center gap-3">
          <button
            className="rounded-card p-2 hover:bg-slate-100 lg:hidden"
            onClick={() => setMenuAberto(true)}
            aria-label="Abrir menu"
          >
            <Menu size={22} />
          </button>
          <Link href="/" className="flex items-center gap-2">
            <ChefHat size={26} className="text-primaria" />
            <span className="text-lg font-bold">
              Compras<span className="text-primaria">Chef</span>
            </span>
          </Link>
        </div>
        <SeletorPapel />
      </header>

      <div className="flex">
        {/* Menu lateral fixo (desktop) */}
        <aside className="sticky top-[57px] hidden h-[calc(100vh-57px)] w-60 shrink-0 overflow-y-auto border-r border-slate-200 bg-superficie lg:block">
          <Navegacao />
        </aside>

        {/* Menu lateral deslizante (celular/tablet) */}
        {menuAberto && (
          <div className="fixed inset-0 z-50 lg:hidden" onClick={() => setMenuAberto(false)}>
            <div className="absolute inset-0 bg-black/40" />
            <div
              className="absolute left-0 top-0 h-full w-64 bg-superficie shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
                <span className="text-lg font-bold">
                  Compras<span className="text-primaria">Chef</span>
                </span>
                <button onClick={() => setMenuAberto(false)} className="rounded-card p-2 hover:bg-slate-100" aria-label="Fechar menu">
                  <X size={20} />
                </button>
              </div>
              <Navegacao aoNavegar={() => setMenuAberto(false)} />
            </div>
          </div>
        )}

        {/* Conteúdo */}
        <main className="min-w-0 flex-1 p-4 lg:p-6">{children}</main>
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
