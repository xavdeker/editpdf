/**
 * Convert PDF coordinate system to screen coordinates.
 * PDF origin is bottom-left; screen origin is top-left.
 */
export function pdfToScreenCoords(
  pdfY: number,
  pageHeight: number,
  blockHeight: number
): number {
  return pageHeight - pdfY - blockHeight;
}

/**
 * Format file size for display.
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

/**
 * Generate a unique id for a text block.
 */
export function generateBlockId(pageIndex: number, itemIndex: number): string {
  return `p${pageIndex}-b${itemIndex}`;
}

/**
 * Maximum upload size in bytes (20 MB).
 */
export const MAX_FILE_SIZE = 20 * 1024 * 1024;

/**
 * Map a PDF internal font name (e.g. "BCDEEE+ArialMT", "TimesNewRomanPSMT-Bold")
 * to the closest available web font from our font list.
 */
export function mapPdfFontToWebFont(fontName: string, pdfJsFontFamily: string): string {
  // Strip subset prefix (e.g., "BCDEEE+")
  const cleaned = fontName.replace(/^[A-Z]{6}\+/, '');

  // Remove style suffixes for matching
  const base = cleaned
    .replace(/[,-]?(Regular|Roman|Book|Medium|Text|Display|Neue|LT|Std|Pro|MT|PS|PSM|PSMT)$/gi, '')
    .replace(/[,-]?(Bold|Italic|Oblique|BoldItalic|BoldOblique|It|BI|Bd|BO)$/gi, '')
    .trim();

  const key = base.toLowerCase().replace(/[\s\-_]/g, '');

  // Map known PDF font base names to web font CSS values
  const fontMap: Record<string, string> = {
    // Sans-serif
    'arial': 'Arial, sans-serif',
    'arialnarrow': 'Arial, sans-serif',
    'helvetica': 'Helvetica, sans-serif',
    'helveticaneue': 'Helvetica, sans-serif',
    'verdana': 'Verdana, sans-serif',
    'tahoma': 'Tahoma, sans-serif',
    'trebuchet': 'Trebuchet MS, sans-serif',
    'trebuchetms': 'Trebuchet MS, sans-serif',
    'calibri': 'Inter, sans-serif',
    'segoeui': 'Inter, sans-serif',
    'segoe': 'Inter, sans-serif',
    'roboto': 'Roboto, sans-serif',
    'opensans': 'Open Sans, sans-serif',
    'lato': 'Lato, sans-serif',
    'montserrat': 'Montserrat, sans-serif',
    'poppins': 'Poppins, sans-serif',
    'raleway': 'Raleway, sans-serif',
    'nunito': 'Nunito, sans-serif',
    'ubuntu': 'Ubuntu, sans-serif',
    'centurygothic': 'Raleway, sans-serif',
    'futura': 'Poppins, sans-serif',
    'avenir': 'Nunito, sans-serif',
    'avenirn': 'Nunito, sans-serif',
    'franklingothic': 'Work Sans, sans-serif',
    'myriad': 'Open Sans, sans-serif',
    'myriadpro': 'Open Sans, sans-serif',
    'gillsans': 'Raleway, sans-serif',
    'optima': 'Raleway, sans-serif',
    'candara': 'Quicksand, sans-serif',
    'corbel': 'Cabin, sans-serif',
    'lucida': 'Verdana, sans-serif',
    'lucidasans': 'Verdana, sans-serif',
    'lucidagrande': 'Verdana, sans-serif',
    'dejavusans': 'Open Sans, sans-serif',
    'noto': 'Inter, sans-serif',
    'notosans': 'Inter, sans-serif',
    'sourcesanspro': 'Open Sans, sans-serif',
    'sourcesans3': 'Open Sans, sans-serif',
    'inter': 'Inter, sans-serif',
    'worksans': 'Work Sans, sans-serif',
    'barlow': 'Barlow, sans-serif',
    'mulish': 'Mulish, sans-serif',
    'arimo': 'Arimo, sans-serif',
    'overpass': 'Overpass, sans-serif',
    'archivo': 'Archivo, sans-serif',
    'sora': 'Sora, sans-serif',
    'oswald': 'Oswald, sans-serif',
    'quicksand': 'Quicksand, sans-serif',
    'cabin': 'Cabin, sans-serif',
    'rubik': 'Rubik, sans-serif',
    'karla': 'Karla, sans-serif',
    'josefinsans': 'Josefin Sans, sans-serif',
    // Serif
    'times': 'Times New Roman, serif',
    'timesnewroman': 'Times New Roman, serif',
    'georgia': 'Georgia, serif',
    'palatino': 'Palatino Linotype, serif',
    'palatinolinotype': 'Palatino Linotype, serif',
    'bookantiqua': 'Book Antiqua, serif',
    'garamond': 'EB Garamond, serif',
    'ebgaramond': 'EB Garamond, serif',
    'cambria': 'Merriweather, serif',
    'constantia': 'Lora, serif',
    'baskerville': 'Libre Baskerville, serif',
    'minion': 'Noto Serif, serif',
    'minionpro': 'Noto Serif, serif',
    'playfairdisplay': 'Playfair Display, serif',
    'merriweather': 'Merriweather, serif',
    'lora': 'Lora, serif',
    'ptserif': 'PT Serif, serif',
    'notoserif': 'Noto Serif, serif',
    'librebaskerville': 'Libre Baskerville, serif',
    'crimsontext': 'Crimson Text, serif',
    'bitter': 'Bitter, serif',
    'cormorantgaramond': 'Cormorant Garamond, serif',
    'spectral': 'Spectral, serif',
    'tinos': 'Tinos, serif',
    'dejavuserif': 'Noto Serif, serif',
    'charterbt': 'Merriweather, serif',
    'century': 'Lora, serif',
    'centuryschoolbook': 'Lora, serif',
    'bookman': 'Libre Baskerville, serif',
    'rockwell': 'Bitter, serif',
    // Monospace
    'courier': 'Courier New, monospace',
    'couriernew': 'Courier New, monospace',
    'consolas': 'Consolas, monospace',
    'lucidaconsole': 'Consolas, monospace',
    'sourcecodepro': 'Source Code Pro, monospace',
    'firacode': 'Fira Code, monospace',
    'jetbrainsmono': 'JetBrains Mono, monospace',
    'ibmplexmono': 'IBM Plex Mono, monospace',
    'inconsolata': 'Inconsolata, monospace',
    'spacemono': 'Space Mono, monospace',
    'dmmono': 'DM Mono, monospace',
    'cousine': 'Cousine, monospace',
    'dejavusansmono': 'Source Code Pro, monospace',
    'monaco': 'Source Code Pro, monospace',
    'menlo': 'Source Code Pro, monospace',
    'andale': 'Inconsolata, monospace',
    'andalemono': 'Inconsolata, monospace',
  };

  if (fontMap[key]) return fontMap[key];

  // Partial matching: check if key contains a known font name
  for (const [mapKey, value] of Object.entries(fontMap)) {
    if (key.includes(mapKey) || mapKey.includes(key)) return value;
  }

  // Fallback: use pdf.js fontFamily hint
  const ff = pdfJsFontFamily.toLowerCase();
  if (/serif/.test(ff) && !/sans/.test(ff)) return 'Times New Roman, serif';
  if (/mono/.test(ff)) return 'Courier New, monospace';
  return 'Helvetica, sans-serif';
}

/**
 * Check if a text block has been modified (text, format, or size).
 */
export function isBlockModified(block: {
  text: string; originalText: string;
  fontSize: number; originalFontSize: number;
  fontFamily: string; originalFontFamily: string;
  isBold: boolean; originalIsBold: boolean;
  isItalic: boolean; originalIsItalic: boolean;
  isErased?: boolean;
}): boolean {
  return block.text !== block.originalText
    || block.fontSize !== block.originalFontSize
    || block.fontFamily !== block.originalFontFamily
    || block.isBold !== block.originalIsBold
    || block.isItalic !== block.originalIsItalic
    || !!block.isErased;
}
