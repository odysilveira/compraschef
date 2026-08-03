import { NextResponse } from "next/server";
import { baixarAfdControlId } from "@/lib/domain/controlid-rep-server";
import { maiorNsrDoAfd } from "@/lib/domain/controlid-rep";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  host?: string;
  login?: string;
  password?: string;
  mode_671?: boolean;
  initial_nsr?: number;
  initial_date?: { year: number; month: number; day: number };
};

/**
 * Proxy server-side para o REP Control iD (HTTPS autoassinado + sem CORS).
 * Só alcança o relógio se este servidor Next estiver na rede local do restaurante.
 */
export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ sucesso: false, erros: ["JSON inválido."] }, { status: 400 });
  }

  const resultado = await baixarAfdControlId(
    {
      host: body.host ?? "",
      login: body.login ?? "admin",
      password: body.password ?? "",
      mode_671: body.mode_671 !== false,
    },
    {
      initial_nsr: body.initial_nsr,
      initial_date: body.initial_date,
    }
  );

  if (!resultado.sucesso) {
    return NextResponse.json(
      { sucesso: false, erros: resultado.erros },
      { status: 422 }
    );
  }

  return NextResponse.json({
    sucesso: true,
    afd_texto: resultado.afd_texto,
    ultimo_nsr: resultado.afd_texto ? maiorNsrDoAfd(resultado.afd_texto) : undefined,
    erros: [],
  });
}
