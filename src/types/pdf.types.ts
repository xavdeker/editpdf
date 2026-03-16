export interface RgbColor {
  r: number;
  g: number;
  b: number;
}

export interface TextBlock {
  id: string;
  pageIndex: number;
  text: string;
  originalText: string;
  x: number;
  y: number;
  width: number;
  height: number;
  originalWidth: number;
  originalHeight: number;
  fontSize: number;
  originalFontSize: number;
  fontName: string;
  fontFamily: string;
  originalFontFamily: string;
  isBold: boolean;
  originalIsBold: boolean;
  isItalic: boolean;
  originalIsItalic: boolean;
  color: RgbColor;
  transform: number[];
  isErased?: boolean;
}

export interface HighlightAnnotation {
  id: string;
  pageIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
}

export interface PenStroke {
  id: string;
  pageIndex: number;
  points: { x: number; y: number }[];
  color: string;
  lineWidth: number;
}

export interface PageAnnotations {
  highlights: HighlightAnnotation[];
  penStrokes: PenStroke[];
}

export type Tool = 'select' | 'addText' | 'eraser' | 'highlight' | 'pen';

export interface PageContent {
  pageIndex: number;
  width: number;
  height: number;
  textBlocks: TextBlock[];
}

export type EditorStep = 'upload' | 'edit' | 'download';

export interface EditorState {
  step: EditorStep;
  file: File | null;
  fileName: string;
  pdfData: ArrayBuffer | null;
  pages: PageContent[];
  currentPage: number;
  isLoading: boolean;
  isScannedPdf: boolean;
}
