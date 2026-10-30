import { NextResponse } from "next/server";
import { generateText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import {
  responderFatosDeterministico,
  type FatosVendasSaipos,
} from "@/lib/domain/saipos-assistente-fatos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Assistente de vendas Saipos.
 *
 * Env (opcional — sem chave usa resposta local baseada nos fatos):
 * - OPENAI_API_KEY
 * - ou AI_GATEWAY_API_KEY (com baseURL do AI Gateway da Vercel)
 *
 * O cliente envia `fatos` já calculados do localStorage; o servidor não lê o arquivo do browser.
 */

type Body = {
  pergunta?: string;
  fatos?: FatosVendasSaipos;
};

const SYSTEM = `Você é o assistente de vendas do ComprasChef, especializado no arquivo mensal do Saipos.
Regras:
- Responda APENAS com base no JSON de fatos enviado. Não invente números, meses ou itens.
- Se faltar mês arquivado ou item, diga claramente o que falta.
- Para Box G / Box P / Kids use totais_por_tamanho e tamanho_buscado (porções dos pratos montados).
- Use português do Brasil, tom objetivo (1 a 4 frases; bullets se ajudar).
- Formate valores em R$ e quantidades de forma legível.
- Não fale de estoque, CMV ou baixa automática.`;

function temChaveIa(): boolean {
  return Boolean(process.env.OPENAI_API_KEY?.trim() || process.env.AI_GATEWAY_API_KEY?.trim());
}

function criarModelo() {
  const gateway = process.env.AI_GATEWAY_API_KEY?.trim();
  const openaiKey = process.env.OPENAI_API_KEY?.trim();
  if (gateway) {
    const openai = createOpenAI({
      apiKey: gateway,
      baseURL: "https://ai-gateway.vercel.sh/v1",
    });
    return openai(process.env.AI_SAIPOS_MODEL?.trim() || "openai/gpt-4o-mini");
  }
  if (openaiKey) {
    const openai = createOpenAI({ apiKey: openaiKey });
    return openai(process.env.AI_SAIPOS_MODEL?.trim() || "gpt-4o-mini");
  }
  return null;
}

export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, erro: "JSON inválido." }, { status: 400 });
  }

  const pergunta = String(body.pergunta ?? "").trim();
  const fatos = body.fatos;
  if (!pergunta) {
    return NextResponse.json({ ok: false, erro: "Informe a pergunta." }, { status: 400 });
  }
  if (!fatos || typeof fatos !== "object" || !Array.isArray(fatos.meses_cobertos)) {
    return NextResponse.json({ ok: false, erro: "Fatos de vendas inválidos." }, { status: 400 });
  }

  const local = responderFatosDeterministico(pergunta, fatos);

  if (!temChaveIa()) {
    return NextResponse.json({ ok: true, fonte: "local" as const, texto: local });
  }

  const model = criarModelo();
  if (!model) {
    return NextResponse.json({ ok: true, fonte: "local" as const, texto: local });
  }

  // Payload enxuto — evita travar com JSON enorme
  const fatosCompactos = {
    ...fatos,
    ranking_itens: (fatos.ranking_itens ?? []).slice(0, 10),
    ranking_pratos_montados: (fatos.ranking_pratos_montados ?? []).slice(0, 10),
    serie_item: (fatos.serie_item ?? []).slice(0, 40),
  };

  try {
    const geracao = generateText({
      model,
      system: SYSTEM,
      prompt: `Pergunta do usuário:\n${pergunta}\n\nFatos (JSON):\n${JSON.stringify(fatosCompactos)}`,
      maxOutputTokens: 400,
    });
    const timeout = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error("tempo esgotado (8s)")), 8000);
    });
    const { text } = await Promise.race([geracao, timeout]);
    const texto = (text || "").trim() || local;
    return NextResponse.json({ ok: true, fonte: "ia" as const, texto });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Falha na IA";
    return NextResponse.json({
      ok: true,
      fonte: "local" as const,
      texto: local,
      aviso_ia: msg,
    });
  }
}
