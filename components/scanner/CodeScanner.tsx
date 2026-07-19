"use client";

// Leitor de QR/código de barras compartilhado.
// - Câmera: usa a API BarcodeDetector do navegador quando disponível (Chrome/Edge).
// - Leitor Bluetooth: funciona como teclado — o campo de texto captura e envia com Enter.
// - Sempre há entrada manual como plano B.

import { useEffect, useRef, useState } from "react";
import { Camera, CameraOff, ScanLine } from "lucide-react";

interface Props {
  rotulo?: string;
  onLeitura: (codigo: string) => void;
}

type DetectorDeCodigo = {
  detect: (source: CanvasImageSource) => Promise<{ rawValue: string }[]>;
};

export default function CodeScanner({ rotulo = "Escanear código", onLeitura }: Props) {
  const [cameraAtiva, setCameraAtiva] = useState(false);
  const [erroCamera, setErroCamera] = useState<string | null>(null);
  const [manual, setManual] = useState("");
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rodandoRef = useRef(false);
  const onLeituraRef = useRef(onLeitura);
  onLeituraRef.current = onLeitura;

  function pararCamera() {
    rodandoRef.current = false;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCameraAtiva(false);
  }

  useEffect(() => pararCamera, []);

  async function ligarCamera() {
    setErroCamera(null);
    const DetectorClasse = (window as unknown as { BarcodeDetector?: new (opts?: unknown) => DetectorDeCodigo })
      .BarcodeDetector;
    if (!DetectorClasse) {
      setErroCamera("Este navegador não lê códigos pela câmera. Use o leitor Bluetooth ou digite o código abaixo.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });
      streamRef.current = stream;
      setCameraAtiva(true);
      rodandoRef.current = true;

      const video = videoRef.current;
      if (!video) return;
      video.srcObject = stream;
      await video.play();

      const detector = new DetectorClasse({
        formats: ["qr_code", "ean_13", "ean_8", "code_128"],
      });

      const varrer = async () => {
        if (!rodandoRef.current || !videoRef.current) return;
        try {
          const codigos = await detector.detect(videoRef.current);
          if (codigos.length > 0 && codigos[0].rawValue) {
            const valor = codigos[0].rawValue;
            pararCamera();
            onLeituraRef.current(valor);
            return;
          }
        } catch {
          // quadro ainda não pronto — tenta de novo
        }
        setTimeout(varrer, 250);
      };
      varrer();
    } catch {
      setErroCamera("Não consegui acessar a câmera. Verifique a permissão ou digite o código abaixo.");
      setCameraAtiva(false);
    }
  }

  function enviarManual() {
    const codigo = manual.trim();
    if (!codigo) return;
    setManual("");
    onLeitura(codigo);
  }

  return (
    <div className="space-y-3">
      {!cameraAtiva ? (
        <button className="btn-gigante" onClick={ligarCamera}>
          <ScanLine size={28} />
          {rotulo}
        </button>
      ) : (
        <div className="space-y-2">
          <video ref={videoRef} className="w-full rounded-card bg-black" muted playsInline />
          <button className="btn-secundario w-full" onClick={pararCamera}>
            <CameraOff size={18} /> Parar câmera
          </button>
        </div>
      )}

      {erroCamera && (
        <p className="rounded-card bg-destaque-clara px-3 py-2 text-sm text-destaque">
          <Camera size={14} className="mr-1 inline" />
          {erroCamera}
        </p>
      )}

      <div className="flex gap-2">
        <input
          className="campo"
          placeholder="Ou digite / use o leitor Bluetooth aqui…"
          value={manual}
          onChange={(e) => setManual(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") enviarManual();
          }}
          autoComplete="off"
        />
        <button className="btn-secundario" onClick={enviarManual}>
          OK
        </button>
      </div>
    </div>
  );
}
