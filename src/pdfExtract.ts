import * as pdfjsLib from 'pdfjs-dist';

// Use CDN worker — works in JupyterLab context
pdfjsLib.GlobalWorkerOptions.workerSrc =
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

export interface IPageData {
  pageNumber: number;
  text: string;
  imageBase64: string | null;
  width: number;
  height: number;
}

export interface IExtractResult {
  pages: IPageData[];
  fullText: string;
  hasImages: boolean;
  isSlideDoc: boolean;
}

const RENDER_SCALE = 1.5;
const MAX_PAGES = 80;

export async function extractPdfFull(file: File): Promise<IExtractResult> {
  const buffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
  const numPages = Math.min(pdf.numPages, MAX_PAGES);

  const pages: IPageData[] = [];
  let totalWords = 0;

  for (let i = 1; i <= numPages; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: 1 });

    const textContent = await page.getTextContent();
    const pageText = (textContent.items as any[])
      .map((item: any) => item.str)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    totalWords += pageText.split(/\s+/).filter(Boolean).length;

    let imageBase64: string | null = null;
    try {
      const canvas = document.createElement('canvas');
      const scaledViewport = page.getViewport({ scale: RENDER_SCALE });
      canvas.width = scaledViewport.width;
      canvas.height = scaledViewport.height;
      const ctx = canvas.getContext('2d')!;
      await page.render({ canvasContext: ctx as any, viewport: scaledViewport }).promise;
      imageBase64 = canvas.toDataURL('image/jpeg', 0.75).split(',')[1];
    } catch (e) {
      console.warn(`[NotebookMind] PDF page ${i} render failed`, e);
    }

    pages.push({
      pageNumber: i,
      text: pageText,
      imageBase64,
      width: viewport.width,
      height: viewport.height
    });
  }

  const avgWords = numPages > 0 ? totalWords / numPages : 0;
  const isSlideDoc = avgWords < 80;
  const hasImages = pages.some(p => p.imageBase64 !== null);

  return {
    pages,
    fullText: pages.map(p => p.text).join('\n\n'),
    hasImages,
    isSlideDoc
  };
}
