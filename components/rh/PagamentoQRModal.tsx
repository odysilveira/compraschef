"use client";

// QR Pix (copia e cola) para pagar um colaborador — usa o mesmo BR Code do PixMoto/PixFreela.

import { useMemo, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Check, Copy } from "lucide-react";
import { Campo, Modal } from "@/components/ui";
import { buildPixPayload, formatChave, maskChave } from "@/lib/pix";
import { moeda } from "@/lib/format";
import type { Colaborador } from "@/lib/types";

export function PagamentoQRModal({
  colaborador,
  valor,
  descricao,
  onFechar,
}: {
  colaborador: Colaborador | null;
  valor: number;
  descricao?: string;
  onFechar: () => void;
}) {
  const [cidade, setCidade] = useState("");
  const [copiado, setCopiado] = useState(false);

  const payload = useMemo(() => {
    if (!colaborador) return "";
    return buildPixPayload({
      chave: formatChave(colaborador.tipo_chave, colaborador.chave),
      valor,
      nome: colaborador.nome,
      cidade,
      descricao: descricao ?? "Pagamento",
    });
  }, [colaborador, valor, cidade, descricao]);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(payload);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      // clipboard indisponível — o texto já está visível pra copiar manualmente
    }
  }

  return (
    <Modal aberto={colaborador !== null} titulo={`Pix para ${colaborador?.nome ?? ""}`} onFechar={onFechar}>
      {colaborador && (
        <div className="flex flex-col items-center gap-4">
          <p className="text-2xl font-bold">{moeda(valor)}</p>
          <div className="rounded-card border border-stone-200 bg-white p-3">
            <QRCodeSVG value={payload} size={200} marginSize={0} />
          </div>
          <p className="text-center text-sm text-stone-500">
            Chave {colaborador.tipo_chave}: <span className="font-medium text-texto">{maskChave(colaborador.tipo_chave, colaborador.chave)}</span>
          </p>

          <div className="w-full">
            <Campo rotulo="Cidade do recebedor (opcional, melhora a leitura no app do banco)">
              <input className="campo" placeholder="ex.: LONDRINA" value={cidade} onChange={(e) => setCidade(e.target.value)} />
            </Campo>
          </div>

          <button type="button" className="btn-secundario w-full justify-center" onClick={copiar}>
            {copiado ? <Check size={16} /> : <Copy size={16} />}
            {copiado ? "Copiado!" : "Copiar código Pix"}
          </button>
        </div>
      )}
    </Modal>
  );
}
