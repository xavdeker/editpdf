import { useState, useCallback } from 'react';
import type { TextItem } from 'pdfjs-dist/types/src/display/api';
import { pdfjsLib } from '../utils/pdfWorker';
import type { PageContent, TextBlock, RgbColor } from '../types/pdf.types';
import { generateBlockId, mapPdfFontToWebFont } from '../utils/pdfUtils';

interface RawItem {
  str: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
  fontName: string;
  fontFamily: string;
  isBold: boolean;
  isItalic: boolean;
  color: RgbColor;
  transform: number[];
}

/** Check if two X ranges overlap */
function xOverlap(
  aMinX: number, aMaxX: number,
  bMinX: number, bMaxX: number,
  tolerance: number
): boolean {
  return aMinX - tolerance <= bMaxX && bMinX - tolerance <= aMaxX;
}

/**
 * Sample the dominant text (ink) color of a block from the rendered page
 * pixels. Using what pdf.js actually drew is far more reliable than parsing
 * color operators (which break on ICC / Separation / pattern color spaces).
 * Returns null when no reliable ink color is found.
 */
function sampleBlockColor(
  img: ImageData,
  block: TextBlock,
  pageHeight: number,
  scale: number
): RgbColor | null {
  const fs = block.fontSize;
  // Block bounds → canvas pixels (PDF origin bottom-left, canvas top-left)
  const x0 = Math.max(0, Math.floor(block.x * scale));
  const x1 = Math.min(img.width, Math.ceil((block.x + block.width) * scale));
  const topPdf = block.y + fs * 0.85;                // ascender of the top line
  const botPdf = block.y - block.height + fs * 0.7;  // descender of the bottom line
  const y0 = Math.max(0, Math.floor((pageHeight - topPdf) * scale));
  const y1 = Math.min(img.height, Math.ceil((pageHeight - botPdf) * scale));
  if (x1 - x0 < 2 || y1 - y0 < 2) return null;

  const data = img.data;
  const W = img.width;

  // 1. Background = most common (quantized) color inside the box
  const hist = new Map<number, number>();
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * W + x) * 4;
      const key = ((data[i] >> 3) << 10) | ((data[i + 1] >> 3) << 5) | (data[i + 2] >> 3);
      hist.set(key, (hist.get(key) ?? 0) + 1);
    }
  }
  let bgKey = 0, bgCount = -1;
  for (const [k, c] of hist) if (c > bgCount) { bgCount = c; bgKey = k; }
  const bgR = ((bgKey >> 10) & 31) << 3;
  const bgG = ((bgKey >> 5) & 31) << 3;
  const bgB = (bgKey & 31) << 3;

  // 2. Strongest ink pixel = largest distance from the background
  let maxDist = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * W + x) * 4;
      const d = Math.abs(data[i] - bgR) + Math.abs(data[i + 1] - bgG) + Math.abs(data[i + 2] - bgB);
      if (d > maxDist) maxDist = d;
    }
  }
  if (maxDist < 45) return null; // no real ink (blank / whitespace block)

  // 3. Average the inked core pixels (closest to the strongest ink), which
  //    avoids the anti-aliased edge pixels that blend toward the background
  const threshold = maxDist * 0.8;
  let r = 0, g = 0, b = 0, n = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * W + x) * 4;
      const d = Math.abs(data[i] - bgR) + Math.abs(data[i + 1] - bgG) + Math.abs(data[i + 2] - bgB);
      if (d >= threshold) { r += data[i]; g += data[i + 1]; b += data[i + 2]; n++; }
    }
  }
  if (n === 0) return null;
  return { r: r / n / 255, g: g / n / 255, b: b / n / 255 };
}

/** Detect bold/italic from a font name string */
function parseFontStyle(fontName: string): { isBold: boolean; isItalic: boolean } {
  const n = fontName.toLowerCase();
  return {
    isBold: /bold|black|heavy|semi[-\s]?bold|demi[-\s]?bold|[_,-]bd(?:\b|$)|w700|w800|w900/.test(n),
    isItalic: /italic|oblique|slanted|[_,-]it(?:\b|$)/.test(n),
  };
}

/** Build a map fontLoadedName → { isBold, isItalic } by probing pdf.js font objects.
 *  Falls back to parseFontStyle on the loadedName if no extra info found. */
async function extractFontStyles(
  page: { commonObjs: unknown; getOperatorList: () => Promise<{ fnArray: number[]; argsArray: unknown[][] }> }
): Promise<Map<string, { isBold: boolean; isItalic: boolean }>> {
  const OPS = pdfjsLib.OPS;
  const ops = await page.getOperatorList();
  const result = new Map<string, { isBold: boolean; isItalic: boolean }>();

  for (let i = 0; i < ops.fnArray.length; i++) {
    if (ops.fnArray[i] !== OPS.setFont) continue;
    const loadedName = ops.argsArray[i][0] as string;
    if (result.has(loadedName)) continue;

    // Start with name-based detection on the loadedName
    let style = parseFontStyle(loadedName);

    // Try to get the real PostScript name / flags from the pdf.js font object
    try {
      const objs = page.commonObjs as { get(key: string): Record<string, unknown> };
      const fontObj = objs.get(loadedName);
      if (fontObj != null && typeof fontObj === 'object') {
        // pdf.js font objects may expose: name, bold, italic, black
        if (fontObj.bold === true) style = { ...style, isBold: true };
        if (fontObj.italic === true) style = { ...style, isItalic: true };
        if (fontObj.black === true) style = { ...style, isBold: true };
        // The 'name' property often has the real PostScript name (e.g. "Arial-BoldMT")
        const realName = (fontObj.name || fontObj.psName || '') as string;
        if (realName && realName !== loadedName) {
          const nameStyle = parseFontStyle(realName);
          if (nameStyle.isBold) style = { ...style, isBold: true };
          if (nameStyle.isItalic) style = { ...style, isItalic: true };
        }
      }
    } catch {
      // commonObjs.get may throw if not yet resolved; ignore
    }

    result.set(loadedName, style);
  }

  return result;
}

/** Pick the most common value in an array */
function mostCommon<T>(items: T[], key: (item: T) => string): T {
  const counts = new Map<string, { item: T; count: number }>();
  for (const item of items) {
    const k = key(item);
    const entry = counts.get(k);
    if (entry) entry.count++;
    else counts.set(k, { item, count: 1 });
  }
  let best = items[0];
  let bestCount = 0;
  for (const { item, count } of counts.values()) {
    if (count > bestCount) { best = item; bestCount = count; }
  }
  return best;
}

/**
 * Group raw text items into segments, then merge vertically adjacent
 * segments that overlap horizontally.
 */
function groupItems(items: RawItem[], pageIndex: number): TextBlock[] {
  if (items.length === 0) return [];

  // Sort top-to-bottom (Y descending in PDF), then left-to-right
  const sorted = [...items].sort((a, b) => {
    const dy = b.y - a.y;
    if (Math.abs(dy) > a.fontSize * 0.3) return dy;
    return a.x - b.x;
  });

  // 1. Group into lines: items with similar Y
  const rawLines: RawItem[][] = [];
  let currentLine: RawItem[] = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    const item = sorted[i];
    const prevItem = currentLine[0];
    const yThreshold = prevItem.fontSize * 0.5;

    if (Math.abs(item.y - prevItem.y) <= yThreshold) {
      currentLine.push(item);
    } else {
      currentLine.sort((a, b) => a.x - b.x);
      rawLines.push(currentLine);
      currentLine = [item];
    }
  }
  currentLine.sort((a, b) => a.x - b.x);
  rawLines.push(currentLine);

  // 2. Split each line into segments where there's a large horizontal gap
  interface Segment { items: RawItem[]; minX: number; maxX: number; y: number; fontSize: number; }
  const allSegments: Segment[] = [];

  for (const line of rawLines) {
    const avgFs = line.reduce((s, it) => s + it.fontSize, 0) / line.length;
    const gapThreshold = avgFs * 2;

    let seg: RawItem[] = [line[0]];
    for (let j = 1; j < line.length; j++) {
      const prev = line[j - 1];
      const curr = line[j];
      const gap = curr.x - (prev.x + prev.width);

      if (gap > gapThreshold) {
        allSegments.push({
          items: seg,
          minX: Math.min(...seg.map((it) => it.x)),
          maxX: Math.max(...seg.map((it) => it.x + it.width)),
          y: seg[0].y,
          fontSize: avgFs,
        });
        seg = [curr];
      } else {
        seg.push(curr);
      }
    }
    allSegments.push({
      items: seg,
      minX: Math.min(...seg.map((it) => it.x)),
      maxX: Math.max(...seg.map((it) => it.x + it.width)),
      y: seg[0].y,
      fontSize: seg.reduce((s, it) => s + it.fontSize, 0) / seg.length,
    });
  }

  // 3. Merge vertically adjacent segments that overlap horizontally
  const used = new Set<number>();
  const groups: Segment[][] = [];

  for (let i = 0; i < allSegments.length; i++) {
    if (used.has(i)) continue;
    used.add(i);

    const group: Segment[] = [allSegments[i]];

    // Try to extend group downward
    let lastAdded = allSegments[i];
    for (let j = i + 1; j < allSegments.length; j++) {
      if (used.has(j)) continue;
      const candidate = allSegments[j];
      const vertGap = lastAdded.y - candidate.y;
      const threshold = lastAdded.fontSize * 1.5;

      if (vertGap >= 0 && vertGap <= threshold) {
        if (xOverlap(lastAdded.minX, lastAdded.maxX, candidate.minX, candidate.maxX, lastAdded.fontSize)) {
          used.add(j);
          group.push(candidate);
          lastAdded = candidate;
        }
      }
    }

    groups.push(group);
  }

  // 4. Convert groups into TextBlocks
  const blocks: TextBlock[] = [];

  groups.forEach((group, groupIdx) => {
    const lineTexts = group.map((seg) => seg.items.map((it) => it.str).join(' '));
    const fullText = lineTexts.join('\n');

    const allItems = group.flatMap((seg) => seg.items);
    const minX = Math.min(...allItems.map((it) => it.x));
    const maxX = Math.max(...allItems.map((it) => it.x + it.width));
    const maxY = Math.max(...allItems.map((it) => it.y));
    const minY = Math.min(...allItems.map((it) => it.y));
    const avgFontSize = allItems.reduce((s, it) => s + it.fontSize, 0) / allItems.length;

    const blockWidth = maxX - minX;
    const blockHeight = maxY - minY + avgFontSize;

    // Use most common font/color from items in this block
    const dominantItem = mostCommon(allItems, (it) => `${it.fontFamily}|${it.isBold}|${it.isItalic}`);
    const dominantColor = mostCommon(allItems, (it) => `${it.color.r},${it.color.g},${it.color.b}`);

    blocks.push({
      id: generateBlockId(pageIndex, groupIdx),
      pageIndex,
      text: fullText,
      originalText: fullText,
      x: minX,
      y: maxY,
      originalX: minX,
      originalY: maxY,
      width: blockWidth,
      height: blockHeight,
      originalWidth: blockWidth,
      originalHeight: blockHeight,
      fontSize: avgFontSize,
      originalFontSize: avgFontSize,
      fontName: dominantItem.fontName,
      fontFamily: dominantItem.fontFamily,
      originalFontFamily: dominantItem.fontFamily,
      isBold: dominantItem.isBold,
      originalIsBold: dominantItem.isBold,
      isItalic: dominantItem.isItalic,
      originalIsItalic: dominantItem.isItalic,
      color: dominantColor.color,
      originalColor: dominantColor.color,
      transform: allItems[0].transform,
    });
  });

  return blocks;
}

export function usePdfParser() {
  const [pages, setPages] = useState<PageContent[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isScannedPdf, setIsScannedPdf] = useState(false);
  const [totalPages, setTotalPages] = useState(0);

  const parsePdf = useCallback(async (data: ArrayBuffer) => {
    setIsLoading(true);
    setIsScannedPdf(false);

    try {
      const dataCopy = data.slice(0);
      const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(dataCopy) }).promise;
      setTotalPages(pdf.numPages);
      const extractedPages: PageContent[] = [];
      let totalTextItems = 0;

      for (let i = 0; i < pdf.numPages; i++) {
        const page = await pdf.getPage(i + 1);
        const viewport = page.getViewport({ scale: 1 });
        const textContent = await page.getTextContent();

        // Extract bold/italic styles from the operator list
        const fontStyles = await extractFontStyles(page);

        const rawItems: RawItem[] = [];

        for (const item of textContent.items) {
          const textItem = item as TextItem;

          if (!textItem.str || textItem.str.trim() === '') continue;

          const tx = textItem.transform;
          const fontSize = Math.sqrt(tx[0] * tx[0] + tx[1] * tx[1]);
          const fontName = textItem.fontName || 'unknown';

          // Get font family: map PDF font name to closest web font
          const style = (textContent.styles as Record<string, { fontFamily?: string }>)[fontName];
          const pdfJsFontFamily = style?.fontFamily || 'sans-serif';
          const fontFamily = mapPdfFontToWebFont(fontName, pdfJsFontFamily);
          // Use font style from commonObjs (more reliable) with fallback to name parsing
          const { isBold, isItalic } = fontStyles.get(fontName) ?? parseFontStyle(fontName);

          rawItems.push({
            str: textItem.str,
            x: tx[4],
            y: tx[5],
            width: textItem.width,
            height: textItem.height || fontSize,
            fontSize,
            fontName,
            fontFamily,
            isBold,
            isItalic,
            // Placeholder — the real color is sampled from the rendered page below
            color: { r: 0, g: 0, b: 0 },
            transform: tx,
          });

          totalTextItems++;
        }

        const textBlocks = groupItems(rawItems, i);

        // Sample each block's real text color from the rendered page pixels
        if (textBlocks.length > 0) {
          try {
            const RENDER_SCALE = 1.5;
            const rvp = page.getViewport({ scale: RENDER_SCALE });
            const canvas = document.createElement('canvas');
            canvas.width = Math.ceil(rvp.width);
            canvas.height = Math.ceil(rvp.height);
            const ctx = canvas.getContext('2d', { willReadFrequently: true });
            if (ctx) {
              await page.render({ canvasContext: ctx, viewport: rvp }).promise;
              const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
              for (const block of textBlocks) {
                const c = sampleBlockColor(img, block, viewport.height, RENDER_SCALE);
                if (c) {
                  block.color = c;
                  block.originalColor = c;
                }
              }
            }
          } catch (err) {
            console.warn('Color sampling failed on page', i, err);
          }
        }

        extractedPages.push({
          pageIndex: i,
          width: viewport.width,
          height: viewport.height,
          textBlocks,
        });
      }

      if (totalTextItems === 0 && pdf.numPages > 0) {
        setIsScannedPdf(true);
      }

      setPages(extractedPages);
    } catch (error) {
      console.error('Error parsing PDF:', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const updateTextBlock = useCallback(
    (blockId: string, newText: string) => {
      setPages((prev) =>
        prev.map((page) => ({
          ...page,
          textBlocks: page.textBlocks.map((block) =>
            block.id === blockId ? { ...block, text: newText } : block
          ),
        }))
      );
    },
    []
  );

  const resizeBlock = useCallback(
    (blockId: string, newWidth: number, newHeight: number) => {
      setPages((prev) =>
        prev.map((page) => ({
          ...page,
          textBlocks: page.textBlocks.map((block) =>
            block.id === blockId
              ? { ...block, width: newWidth, height: newHeight }
              : block
          ),
        }))
      );
    },
    []
  );

  const moveBlock = useCallback(
    (blockId: string, newX: number, newY: number) => {
      setPages((prev) =>
        prev.map((page) => ({
          ...page,
          textBlocks: page.textBlocks.map((block) =>
            block.id === blockId ? { ...block, x: newX, y: newY } : block
          ),
        }))
      );
    },
    []
  );

  const updateBlockFormat = useCallback(
    (blockId: string, format: Partial<Pick<TextBlock, 'fontSize' | 'isBold' | 'isItalic' | 'fontFamily' | 'color'>>) => {
      setPages((prev) =>
        prev.map((page) => ({
          ...page,
          textBlocks: page.textBlocks.map((block) =>
            block.id === blockId ? { ...block, ...format } : block
          ),
        }))
      );
    },
    []
  );

  const eraseBlock = useCallback(
    (blockId: string) => {
      setPages((prev) =>
        prev.map((page) => {
          const target = page.textBlocks.find((b) => b.id === blockId);
          // Added text blocks (no original text) are removed outright
          if (target && target.originalText === '') {
            return {
              ...page,
              textBlocks: page.textBlocks.filter((b) => b.id !== blockId),
            };
          }
          // Original blocks stay flagged as erased (covered by a white rect on export)
          return {
            ...page,
            textBlocks: page.textBlocks.map((block) =>
              block.id === blockId ? { ...block, isErased: true, text: '' } : block
            ),
          };
        })
      );
    },
    []
  );

  const addTextBlock = useCallback(
    (pageIndex: number, x: number, y: number) => {
      const id = `p${pageIndex}-new-${Date.now()}`;
      const newBlock: TextBlock = {
        id,
        pageIndex,
        text: '',
        originalText: '',
        x,
        y,
        originalX: x,
        originalY: y,
        width: 150,
        height: 20,
        originalWidth: 0,
        originalHeight: 0,
        fontSize: 14,
        originalFontSize: 14,
        fontName: 'Helvetica',
        fontFamily: 'Helvetica, sans-serif',
        originalFontFamily: 'Helvetica, sans-serif',
        isBold: false,
        originalIsBold: false,
        isItalic: false,
        originalIsItalic: false,
        color: { r: 0, g: 0, b: 0 },
        originalColor: { r: 0, g: 0, b: 0 },
        transform: [14, 0, 0, 14, x, y],
      };
      setPages((prev) =>
        prev.map((page) =>
          page.pageIndex === pageIndex
            ? { ...page, textBlocks: [...page.textBlocks, newBlock] }
            : page
        )
      );
      return id;
    },
    []
  );

  const resetAllText = useCallback(() => {
    setPages((prev) =>
      prev.map((page) => ({
        ...page,
        textBlocks: page.textBlocks
          .filter((block) => block.originalText !== '') // remove added blocks
          .map((block) => ({
            ...block,
            text: block.originalText,
            x: block.originalX,
            y: block.originalY,
            width: block.originalWidth,
            height: block.originalHeight,
            fontSize: block.originalFontSize,
            fontFamily: block.originalFontFamily,
            color: block.originalColor,
            isBold: block.originalIsBold,
            isItalic: block.originalIsItalic,
            isErased: undefined,
          })),
      }))
    );
  }, []);

  return {
    pages,
    isLoading,
    isScannedPdf,
    totalPages,
    parsePdf,
    updateTextBlock,
    updateBlockFormat,
    eraseBlock,
    addTextBlock,
    resizeBlock,
    moveBlock,
    resetAllText,
  };
}
