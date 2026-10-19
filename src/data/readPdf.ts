import { layoutLines, type PdfItem } from './pdfStatements';

/** The text of a PDF, laid out in lines, read on this device (pdf.js loads only when a PDF is chosen). */
export async function pdfText(file: File): Promise<string> {
  const [pdfjs, worker] = await Promise.all([
    import('pdfjs-dist/legacy/build/pdf.mjs'),
    import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'),
  ]);
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false }).promise;
  try {
    const pages: PdfItem[][] = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const tc = await (await doc.getPage(i)).getTextContent();
      pages.push(tc.items.filter((it): it is Extract<typeof it, { str: string }> => 'str' in it).map((it) => ({
        str: it.str, x: it.transform[4], y: it.transform[5], width: it.width, height: it.height || Math.abs(it.transform[3]),
        rotated: Math.abs(it.transform[1]) > 0.01 || Math.abs(it.transform[2]) > 0.01,
      })));
    }
    return layoutLines(pages);
  } finally { await doc.destroy(); }
}
