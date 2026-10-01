import https from "node:https";
import type { ConfigControlId } from "../types";
import { hostControlIdPermitido, normalizarHostControlId, urlControlId } from "./controlid-rep";

function httpsPostTexto(url: string, body: unknown): Promise<{ status: number; texto: string }> {
  const payload = JSON.stringify(body ?? {});
  return new Promise((resolve, reject) => {
    const req = https.request(
      url,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload, "utf8"),
          Expect: "",
        },
        rejectUnauthorized: false,
        timeout: 20000,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
        res.on("end", () => {
          resolve({
            status: res.statusCode ?? 0,
            texto: Buffer.concat(chunks).toString("utf8"),
          });
        });
      }
    );
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("Timeout ao falar com o REP Control iD."));
    });
    // Desliga Expect: 100-continue (exigência da doc Control iD)
    req.removeHeader("Expect");
    req.write(payload, "utf8");
    req.end();
  });
}

export interface ResultadoAfdControlId {
  sucesso: boolean;
  afd_texto?: string;
  session?: string;
  erros: string[];
}

export interface OpcoesBaixarAfd {
  initial_date?: { year: number; month: number; day: number };
  initial_nsr?: number;
}

/**
 * Login + get_afd no REP iDClass (rede local).
 * Deve rodar no servidor Node (API route), não no browser (CORS + certificado).
 */
export async function baixarAfdControlId(
  config: Pick<ConfigControlId, "host" | "login" | "password" | "mode_671">,
  opcoes: OpcoesBaixarAfd = {}
): Promise<ResultadoAfdControlId> {
  const host = normalizarHostControlId(config.host);
  if (!hostControlIdPermitido(host)) {
    return {
      sucesso: false,
      erros: ["Host inválido. Use IP da rede local (ex.: 192.168.x.x) ou localhost."],
    };
  }
  if (!config.login.trim() || !config.password) {
    return { sucesso: false, erros: ["Informe login e senha do REP."] };
  }

  try {
    const loginUrl = urlControlId(host, "/login.fcgi");
    const loginRes = await httpsPostTexto(loginUrl, {
      login: config.login.trim(),
      password: config.password,
    });
    if (loginRes.status < 200 || loginRes.status >= 300) {
      return {
        sucesso: false,
        erros: [`Login falhou (HTTP ${loginRes.status}). Verifique IP, usuário e senha.`],
      };
    }

    let session = "";
    try {
      const json = JSON.parse(loginRes.texto) as { session?: string };
      session = String(json.session ?? "").trim();
    } catch {
      return { sucesso: false, erros: ["Resposta de login inválida (não é JSON com session)."] };
    }
    if (!session) {
      return { sucesso: false, erros: ["Login sem session. Confira as credenciais do relógio."] };
    }

    const query: Record<string, string> = { session };
    if (config.mode_671 !== false) query.mode = "671";

    const body: Record<string, unknown> = {};
    if (opcoes.initial_nsr != null && Number.isFinite(opcoes.initial_nsr)) {
      body.initial_nsr = Math.floor(opcoes.initial_nsr);
    } else if (opcoes.initial_date) {
      body.initial_date = opcoes.initial_date;
    }

    const afdUrl = urlControlId(host, "/get_afd.fcgi", query);
    const afdRes = await httpsPostTexto(afdUrl, body);
    if (afdRes.status < 200 || afdRes.status >= 300) {
      return {
        sucesso: false,
        session,
        erros: [`get_afd falhou (HTTP ${afdRes.status}).`],
      };
    }
    if (!afdRes.texto.trim()) {
      return { sucesso: false, session, erros: ["AFD vazio retornado pelo REP."] };
    }

    return { sucesso: true, afd_texto: afdRes.texto, session, erros: [] };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro de rede ao falar com o REP.";
    return {
      sucesso: false,
      erros: [
        `${msg} O Next.js precisa estar na mesma rede do relógio (não funciona na nuvem/Vercel).`,
      ],
    };
  }
}
