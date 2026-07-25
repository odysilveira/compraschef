import {
  eliminarDuplicidadeRepresentacaoBoletos,
  identificarBoletosValidosNoTexto,
  type ResultadoIdentificacaoTextoBoleto,
  type BoletoValidoIdentificado,
} from "./identificacao-boleto";

interface BarcodeDetectorResultLike {
  rawValue?: string;
}

interface BarcodeDetectorConstructorLike {
  new (options?: { formats?: string[] }): {
    detect: (source: ImageBitmapSource) => Promise<BarcodeDetectorResultLike[]>;
  };
  getSupportedFormats?: () => Promise<string[]>;
}

const FORMATOS_BARCODE_PRIORITARIOS = ["itf", "code_128", "code_39", "ean_13", "ean_8", "upc_a", "upc_e"];
const MAXIMO_PAGINAS_PDF = 5;

type AcumuladoIdentificacao = { quantidadeCandidatos: number; validos: BoletoValidoIdentificado[] };

export interface DiagnosticoIdentificacaoBoleto {
  pdfAberto: boolean;
  paginasProcessadas: number;
  textoEncontrado: boolean;
  candidatosNumericosEncontrados: number;
  barcodeDetectorDisponivel: boolean;
  barcodeDetectorExecutado: boolean;
  zxingExecutado: boolean;
  resultadoValidoEncontrado: boolean;
  falhaTecnica?: string;
}

export type CategoriaFalhaPdf =
  | "worker não carregado"
  | "módulo PDF não carregado"
  | "PDF protegido por senha"
  | "PDF inválido"
  | "leitura cancelada"
  | "erro desconhecido";

function deduplicarResultados(validos: BoletoValidoIdentificado[]): BoletoValidoIdentificado[] {
  return eliminarDuplicidadeRepresentacaoBoletos(validos);
}

function acumularResultadoTexto(resultado: ResultadoIdentificacaoTextoBoleto, acumulado: AcumuladoIdentificacao): void {
  acumulado.quantidadeCandidatos += resultado.quantidadeCandidatos;
  acumulado.validos.push(...resultado.validos);
}

function registrarResultadoTexto(texto: string, acumulado: AcumuladoIdentificacao): void {
  acumularResultadoTexto(identificarBoletosValidosNoTexto(texto), acumulado);
}

function criarDiagnosticoInicial(): DiagnosticoIdentificacaoBoleto {
  return {
    pdfAberto: false,
    paginasProcessadas: 0,
    textoEncontrado: false,
    candidatosNumericosEncontrados: 0,
    barcodeDetectorDisponivel: false,
    barcodeDetectorExecutado: false,
    zxingExecutado: false,
    resultadoValidoEncontrado: false,
  };
}

function registrarFalhaTecnica(diagnostico: DiagnosticoIdentificacaoBoleto, mensagem: string): void {
  if (!diagnostico.falhaTecnica) {
    diagnostico.falhaTecnica = mensagem;
  }
}

function textoErro(erro: unknown): string {
  if (erro instanceof Error) {
    return `${erro.name} ${erro.message}`.toLowerCase();
  }
  return String(erro ?? "").toLowerCase();
}

export function classificarFalhaPdf(erro: unknown): CategoriaFalhaPdf {
  const texto = textoErro(erro);

  if (texto.includes("password") || texto.includes("senha")) {
    return "PDF protegido por senha";
  }
  if (texto.includes("invalidpdf") || texto.includes("invalid pdf") || texto.includes("formaterror") || texto.includes("malformed")) {
    return "PDF inválido";
  }
  if (texto.includes("cancel") || texto.includes("abort") || texto.includes("aborted") || texto.includes("destroyed")) {
    return "leitura cancelada";
  }
  if (texto.includes("worker") || texto.includes("fake worker") || texto.includes("globalworkeroptions") || texto.includes("workersrc")) {
    return "worker não carregado";
  }

  return "erro desconhecido";
}

export function criarBytesPdfComCopia(buffer: ArrayBuffer): Uint8Array {
  const copia = buffer.slice(0);
  return new Uint8Array(copia);
}

function configurarWorkerPdfLocal(pdfjs: { GlobalWorkerOptions?: { workerSrc?: string } }): void {
  if (!pdfjs.GlobalWorkerOptions) {
    throw new Error("GlobalWorkerOptions indisponível");
  }
  const workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
  pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;
}

function obterBarcodeDetectorGlobal(): BarcodeDetectorConstructorLike | undefined {
  const candidato = (globalThis as { BarcodeDetector?: BarcodeDetectorConstructorLike }).BarcodeDetector;
  return candidato;
}

async function criarDetectorCompativel(): Promise<{
  detect: (source: ImageBitmapSource) => Promise<BarcodeDetectorResultLike[]>;
} | null> {
  const BarcodeDetectorGlobal = obterBarcodeDetectorGlobal();
  if (!BarcodeDetectorGlobal) return null;

  const suportados = BarcodeDetectorGlobal.getSupportedFormats
    ? await BarcodeDetectorGlobal.getSupportedFormats().catch(() => [])
    : [];

  const formatos = suportados.length
    ? FORMATOS_BARCODE_PRIORITARIOS.filter((formato) => suportados.includes(formato))
    : FORMATOS_BARCODE_PRIORITARIOS;

  if (suportados.length > 0 && formatos.length === 0) return null;

  return new BarcodeDetectorGlobal({ formats: formatos.length ? formatos : undefined });
}

export function combinarTextosPdfFragmentados(textContent: { items: Array<{ str?: string; hasEOL?: boolean }> }): string {
  let combinado = "";

  for (const item of textContent.items) {
    const bruto = (item.str ?? "").replace(/\u00a0/g, " ").trim();
    if (!bruto) continue;

    if (!combinado) {
      combinado = bruto;
    } else {
      const ultimo = combinado[combinado.length - 1];
      const primeiro = bruto[0];
      const juntarSemEspaco = /\d/.test(ultimo) && /\d/.test(primeiro);
      combinado += juntarSemEspaco ? bruto : ` ${bruto}`;
    }

    if (item.hasEOL) {
      combinado += "\n";
    }
  }

  return combinado.replace(/[ \t]+/g, " ").replace(/\n[ \t]+/g, "\n").trim();
}

export function validarResultadosVisuaisBrutos(leituras: string[]): ResultadoIdentificacaoArquivoBoleto {
  const acumulado: AcumuladoIdentificacao = { quantidadeCandidatos: 0, validos: [] };
  const diagnostico = criarDiagnosticoInicial();
  for (const leitura of leituras) {
    const resultado = identificarBoletosValidosNoTexto(leitura);
    acumularResultadoTexto(resultado, acumulado);
    diagnostico.candidatosNumericosEncontrados += resultado.quantidadeCandidatos;
    if (leitura.trim()) {
      diagnostico.textoEncontrado = true;
    }
  }

  const validos = deduplicarResultados(acumulado.validos);
  diagnostico.resultadoValidoEncontrado = validos.length > 0;

  return {
    quantidadeCandidatos: diagnostico.candidatosNumericosEncontrados,
    validos,
    diagnostico,
  };
}

export function deveManterCampoManual(resultado: ResultadoIdentificacaoArquivoBoleto): boolean {
  return resultado.validos.length === 0;
}

function extrairLeituraResultante(resultado: unknown): string | null {
  if (!resultado || typeof resultado !== "object") return null;
  const candidato = resultado as { getText?: () => string; text?: string };
  if (typeof candidato.getText === "function") return candidato.getText();
  if (typeof candidato.text === "string") return candidato.text;
  return null;
}

function criarCanvasRegiaoInferior(canvasOriginal: HTMLCanvasElement): HTMLCanvasElement {
  const alturaRecorte = Math.max(1, Math.floor(canvasOriginal.height * 0.45));
  const origemY = Math.max(0, canvasOriginal.height - alturaRecorte);
  const recorte = document.createElement("canvas");
  recorte.width = canvasOriginal.width;
  recorte.height = alturaRecorte;
  const contexto = recorte.getContext("2d");
  if (contexto) {
    contexto.drawImage(canvasOriginal, 0, origemY, canvasOriginal.width, alturaRecorte, 0, 0, recorte.width, recorte.height);
  }
  return recorte;
}

function fontesDeLeituraDoCanvas(canvasOriginal: HTMLCanvasElement): HTMLCanvasElement[] {
  return [canvasOriginal, criarCanvasRegiaoInferior(canvasOriginal)];
}

async function identificarViaBarcode(
  detector: { detect: (source: ImageBitmapSource) => Promise<BarcodeDetectorResultLike[]> },
  source: ImageBitmapSource,
  acumulado: AcumuladoIdentificacao,
  diagnostico: DiagnosticoIdentificacaoBoleto
): Promise<void> {
  diagnostico.barcodeDetectorExecutado = true;
  const resultados = await detector.detect(source);
  for (const resultado of resultados) {
    if (!resultado.rawValue) continue;
    registrarResultadoTexto(resultado.rawValue, acumulado);
    diagnostico.textoEncontrado = true;
  }
}

async function identificarCanvasComBarcodeDetector(
  canvas: HTMLCanvasElement,
  detector: { detect: (source: ImageBitmapSource) => Promise<BarcodeDetectorResultLike[]> },
  acumulado: AcumuladoIdentificacao,
  diagnostico: DiagnosticoIdentificacaoBoleto
): Promise<void> {
  for (const fonte of fontesDeLeituraDoCanvas(canvas)) {
    await identificarViaBarcode(detector, fonte, acumulado, diagnostico);
  }
}

async function decodificarCanvasComZXingITF(canvas: HTMLCanvasElement): Promise<string | null> {
  const zxing = (await import("@zxing/browser")) as unknown as {
    BrowserMultiFormatReader?: new (...args: unknown[]) => object;
    BarcodeFormat?: { ITF?: unknown };
    DecodeHintType?: { POSSIBLE_FORMATS?: unknown };
  };
  if (!zxing.BrowserMultiFormatReader) return null;

  const hints = new Map<unknown, unknown>();
  if (zxing.DecodeHintType?.POSSIBLE_FORMATS && zxing.BarcodeFormat?.ITF !== undefined) {
    hints.set(zxing.DecodeHintType.POSSIBLE_FORMATS, [zxing.BarcodeFormat.ITF]);
  }

  const leitor = new zxing.BrowserMultiFormatReader(hints.size ? hints : undefined);
  const alvo = canvas;
  const leitorComMetodos = leitor as Record<string, unknown>;

  if (typeof leitorComMetodos.decodeFromCanvas === "function") {
    const resultado = await (leitorComMetodos.decodeFromCanvas as (src: HTMLCanvasElement) => Promise<unknown>)(alvo);
    return extrairLeituraResultante(resultado);
  }

  if (typeof leitorComMetodos.decodeFromCanvasElement === "function") {
    const resultado = await (leitorComMetodos.decodeFromCanvasElement as (src: HTMLCanvasElement) => Promise<unknown>)(alvo);
    return extrairLeituraResultante(resultado);
  }

  if (typeof leitorComMetodos.decodeFromImageElement === "function") {
    const imagem = document.createElement("img");
    imagem.src = alvo.toDataURL("image/png");
    await imagem.decode().catch(() => undefined);
    const resultado = await (leitorComMetodos.decodeFromImageElement as (src: HTMLImageElement) => Promise<unknown>)(imagem);
    imagem.src = "";
    return extrairLeituraResultante(resultado);
  }

  return null;
}

async function identificarCanvasComZXingITF(
  canvas: HTMLCanvasElement,
  acumulado: AcumuladoIdentificacao,
  diagnostico: DiagnosticoIdentificacaoBoleto
): Promise<void> {
  for (const fonte of fontesDeLeituraDoCanvas(canvas)) {
    diagnostico.zxingExecutado = true;
    try {
      const leitura = await decodificarCanvasComZXingITF(fonte);
      if (leitura) {
        registrarResultadoTexto(leitura, acumulado);
        diagnostico.textoEncontrado = true;
      }
    } catch {
      registrarFalhaTecnica(diagnostico, "erro desconhecido");
    }
  }
}

async function identificarEmImagemArquivo(
  arquivo: File,
  acumulado: AcumuladoIdentificacao,
  deveCancelar: () => boolean,
  diagnostico: DiagnosticoIdentificacaoBoleto
): Promise<void> {
  if (deveCancelar()) return;
  const detector = await criarDetectorCompativel().catch(() => {
    registrarFalhaTecnica(diagnostico, "erro desconhecido");
    return null;
  });
  diagnostico.barcodeDetectorDisponivel = Boolean(detector);

  const bitmap = await createImageBitmap(arquivo).catch(() => {
    registrarFalhaTecnica(diagnostico, "erro desconhecido");
    return null;
  });
  if (!bitmap) return;
  try {
    if (deveCancelar()) return;
    if (detector) {
      try {
        await identificarViaBarcode(detector, bitmap, acumulado, diagnostico);
      } catch {
        registrarFalhaTecnica(diagnostico, "erro desconhecido");
      }
    }

    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const contexto = canvas.getContext("2d");
    if (!contexto) {
      registrarFalhaTecnica(diagnostico, "erro desconhecido");
      return;
    }
    contexto.drawImage(bitmap, 0, 0);

    if (deveCancelar()) return;
    if (detector) {
      try {
        await identificarCanvasComBarcodeDetector(canvas, detector, acumulado, diagnostico);
      } catch {
        registrarFalhaTecnica(diagnostico, "erro desconhecido");
      }
    }
    if (deveCancelar()) return;
    await identificarCanvasComZXingITF(canvas, acumulado, diagnostico);
  } finally {
    bitmap.close();
  }
}

async function identificarEmPdfArquivo(
  arquivo: File,
  acumulado: AcumuladoIdentificacao,
  deveCancelar: () => boolean,
  diagnostico: DiagnosticoIdentificacaoBoleto
): Promise<void> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs").catch(() => null);
  if (!pdfjs) {
    registrarFalhaTecnica(diagnostico, "módulo PDF não carregado");
    return;
  }

  try {
    configurarWorkerPdfLocal(pdfjs as { GlobalWorkerOptions?: { workerSrc?: string } });
  } catch {
    registrarFalhaTecnica(diagnostico, "worker não carregado");
    return;
  }

  const bufferOriginal = await arquivo.arrayBuffer();
  const dados = criarBytesPdfComCopia(bufferOriginal);
  const loadingTask = (pdfjs as { getDocument: (params: { data: Uint8Array }) => { promise: Promise<unknown>; destroy?: () => Promise<void> } }).getDocument({ data: dados });

  const documento = await loadingTask.promise.catch((erro) => {
    registrarFalhaTecnica(diagnostico, classificarFalhaPdf(erro));
    return null;
  });
  if (!documento) {
    return;
  }
  diagnostico.pdfAberto = true;

  const detector = await criarDetectorCompativel().catch(() => {
    registrarFalhaTecnica(diagnostico, "erro desconhecido");
    return null;
  });
  diagnostico.barcodeDetectorDisponivel = Boolean(detector);

  try {
    const documentoPdf = documento as {
      numPages: number;
      getPage: (indice: number) => Promise<{
        getTextContent: () => Promise<unknown>;
        getViewport: (opcoes: { scale: number }) => { width: number; height: number };
        render: (opcoes: { canvasContext: CanvasRenderingContext2D; viewport: { width: number; height: number }; canvas: HTMLCanvasElement }) => { promise: Promise<void> };
      }>;
    };
    const totalPaginas = Math.min(documentoPdf.numPages, MAXIMO_PAGINAS_PDF);

    for (let indicePagina = 1; indicePagina <= totalPaginas; indicePagina += 1) {
      if (deveCancelar()) {
        registrarFalhaTecnica(diagnostico, "leitura cancelada");
        return;
      }

      const pagina = await documentoPdf.getPage(indicePagina).catch((erro) => {
        registrarFalhaTecnica(diagnostico, classificarFalhaPdf(erro));
        return null;
      });
      if (!pagina) {
        continue;
      }

      const conteudoTexto = await pagina.getTextContent().catch(() => null);
      if (conteudoTexto) {
        const texto = combinarTextosPdfFragmentados(conteudoTexto as { items: Array<{ str?: string; hasEOL?: boolean }> });
        if (texto.trim()) {
          diagnostico.textoEncontrado = true;
        }
        registrarResultadoTexto(texto, acumulado);
      }

      const viewport = pagina.getViewport({ scale: 2 });
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.floor(viewport.width));
      canvas.height = Math.max(1, Math.floor(viewport.height));

      const contexto = canvas.getContext("2d", { alpha: false });
      if (!contexto) {
        continue;
      }

      const renderizado = await pagina.render({ canvasContext: contexto, viewport, canvas }).promise
        .then(() => true)
        .catch((erro) => {
          registrarFalhaTecnica(diagnostico, classificarFalhaPdf(erro));
          return false;
        });
      if (!renderizado) {
        continue;
      }

      diagnostico.paginasProcessadas += 1;

      if (deveCancelar()) {
        registrarFalhaTecnica(diagnostico, "leitura cancelada");
        return;
      }

      if (detector) {
        try {
          await identificarCanvasComBarcodeDetector(canvas, detector, acumulado, diagnostico);
        } catch {
          registrarFalhaTecnica(diagnostico, "erro desconhecido");
        }
      }

      if (deveCancelar()) {
        registrarFalhaTecnica(diagnostico, "leitura cancelada");
        return;
      }

      await identificarCanvasComZXingITF(canvas, acumulado, diagnostico);
    }
  } finally {
    if (typeof loadingTask.destroy === "function") {
      await loadingTask.destroy().catch(() => undefined);
    }
  }
}

export interface ResultadoIdentificacaoArquivoBoleto {
  quantidadeCandidatos: number;
  validos: BoletoValidoIdentificado[];
  diagnostico: DiagnosticoIdentificacaoBoleto;
}

function tipoArquivoEhPdf(nomeArquivo: string): boolean {
  return nomeArquivo.toLowerCase().endsWith(".pdf");
}

function tipoArquivoEhImagem(nomeArquivo: string): boolean {
  const nome = nomeArquivo.toLowerCase();
  return nome.endsWith(".png") || nome.endsWith(".jpg") || nome.endsWith(".jpeg");
}

export async function identificarCodigoBoletoNoArquivoLocal(
  arquivo: File,
  deveCancelar: () => boolean
): Promise<ResultadoIdentificacaoArquivoBoleto> {
  const acumulado: AcumuladoIdentificacao = {
    quantidadeCandidatos: 0,
    validos: [],
  };
  const diagnostico = criarDiagnosticoInicial();

  try {
    if (tipoArquivoEhPdf(arquivo.name)) {
      await identificarEmPdfArquivo(arquivo, acumulado, deveCancelar, diagnostico);
    } else if (tipoArquivoEhImagem(arquivo.name)) {
      await identificarEmImagemArquivo(arquivo, acumulado, deveCancelar, diagnostico);
    }
  } catch {
    registrarFalhaTecnica(diagnostico, "erro desconhecido");
  }

  const validos = deduplicarResultados(acumulado.validos);
  diagnostico.candidatosNumericosEncontrados = acumulado.quantidadeCandidatos;
  diagnostico.resultadoValidoEncontrado = validos.length > 0;

  return {
    quantidadeCandidatos: acumulado.quantidadeCandidatos,
    validos,
    diagnostico,
  };
}
