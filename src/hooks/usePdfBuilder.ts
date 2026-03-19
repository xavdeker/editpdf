import { useCallback, useState } from 'react';
import { PDFDocument, rgb, StandardFonts, PDFFont } from 'pdf-lib';
import type { PageContent, TextBlock, HighlightAnnotation, PenStroke } from '../types/pdf.types';
import { isBlockModified } from '../utils/pdfUtils';

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const m = hex.replace('#', '').match(/.{2}/g);
  if (!m) return { r: 0, g: 0, b: 0 };
  return { r: parseInt(m[0], 16) / 255, g: parseInt(m[1], 16) / 255, b: parseInt(m[2], 16) / 255 };
}

function wrapText(text: string, font: PDFFont, fontSize: number, maxWidth: number): string[] {
  if (maxWidth <= 0) return [text];

  const words = text.split(' ');
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    const testWidth = font.widthOfTextAtSize(testLine, fontSize);

    if (testWidth > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }

  if (currentLine) lines.push(currentLine);
  return lines.length > 0 ? lines : [''];
}

export function usePdfBuilder() {
  const [isBuilding, setIsBuilding] = useState(false);

  const buildPdf = useCallback(
    async (
      originalData: ArrayBuffer,
      pages: PageContent[],
      highlights: HighlightAnnotation[] = [],
      penStrokes: PenStroke[] = [],
    ): Promise<Uint8Array> => {
      setIsBuilding(true);

      try {
        const dataCopy = originalData.slice(0);
        const pdfDoc = await PDFDocument.load(dataCopy, {
          ignoreEncryption: true,
        });

        const fonts = {
          sansNormal: await pdfDoc.embedFont(StandardFonts.Helvetica),
          sansBold: await pdfDoc.embedFont(StandardFonts.HelveticaBold),
          sansItalic: await pdfDoc.embedFont(StandardFonts.HelveticaOblique),
          sansBoldItalic: await pdfDoc.embedFont(StandardFonts.HelveticaBoldOblique),
          serifNormal: await pdfDoc.embedFont(StandardFonts.TimesRoman),
          serifBold: await pdfDoc.embedFont(StandardFonts.TimesRomanBold),
          serifItalic: await pdfDoc.embedFont(StandardFonts.TimesRomanItalic),
          serifBoldItalic: await pdfDoc.embedFont(StandardFonts.TimesRomanBoldItalic),
          monoNormal: await pdfDoc.embedFont(StandardFonts.Courier),
          monoBold: await pdfDoc.embedFont(StandardFonts.CourierBold),
          monoItalic: await pdfDoc.embedFont(StandardFonts.CourierOblique),
          monoBoldItalic: await pdfDoc.embedFont(StandardFonts.CourierBoldOblique),
        };

        function pickFont(block: TextBlock): PDFFont {
          const ff = (block.fontFamily || block.fontName).toLowerCase();
          let family: 'sans' | 'serif' | 'mono' = 'sans';
          if (/mono|courier|consolas|inconsolata|fira\s?code|jetbrains/i.test(ff)) family = 'mono';
          else if (/(?<!sans[-\s])serif|times|garamond|palatino|georgia|cambria|bookman|minion|merriweather|lora|baskerville|spectral|crimson|bitter|tinos/i.test(ff)) family = 'serif';

          const variant = block.isBold && block.isItalic ? 'BoldItalic'
            : block.isBold ? 'Bold'
            : block.isItalic ? 'Italic'
            : 'Normal';
          return fonts[`${family}${variant}`];
        }

        const pdfPages = pdfDoc.getPages();

        for (const pageContent of pages) {
          const pdfPage = pdfPages[pageContent.pageIndex];
          if (!pdfPage) continue;

          // Draw highlights (behind text)
          const pageHighlights = highlights.filter((h) => h.pageIndex === pageContent.pageIndex);
          for (const hl of pageHighlights) {
            const c = hexToRgb(hl.color);
            pdfPage.drawRectangle({
              x: hl.x,
              y: hl.y,
              width: hl.width,
              height: hl.height,
              color: rgb(c.r, c.g, c.b),
              opacity: 0.35,
              borderWidth: 0,
            });
          }

          // Draw pen strokes
          const pageStrokes = penStrokes.filter((s) => s.pageIndex === pageContent.pageIndex);
          for (const stroke of pageStrokes) {
            if (stroke.points.length < 2) continue;
            const c = hexToRgb(stroke.color);
            for (let i = 1; i < stroke.points.length; i++) {
              pdfPage.drawLine({
                start: { x: stroke.points[i - 1].x, y: stroke.points[i - 1].y },
                end: { x: stroke.points[i].x, y: stroke.points[i].y },
                thickness: stroke.lineWidth,
                color: rgb(c.r, c.g, c.b),
              });
            }
          }

          // Text blocks
          for (const block of pageContent.textBlocks) {
            if (!isBlockModified(block)) continue;

            const fontSize = Math.min(Math.max(block.fontSize, 4), 72);
            const margin = 1;
            const font = pickFont(block);

            const coverW = Math.max(block.originalWidth, block.width) + margin * 2;
            const blockH = Math.max(block.originalHeight, block.height);
            const coverH = blockH + fontSize + margin * 2;
            const coverX = block.x - margin;
            const coverY = block.y - blockH - margin;

            // White rectangle to cover original text
            pdfPage.drawRectangle({
              x: coverX,
              y: coverY,
              width: coverW,
              height: coverH,
              color: rgb(1, 1, 1),
              borderWidth: 0,
            });

            // Skip text drawing for erased blocks (just white rect)
            if (block.isErased || !block.text) continue;

            const lineHeight = fontSize * 1.3;
            const paragraphs = block.text.split('\n');
            let lineIndex = 0;

            for (const para of paragraphs) {
              const wrapped = wrapText(para, font, fontSize, block.width);
              for (const line of wrapped) {
                const lineY = block.y - lineIndex * lineHeight;
                pdfPage.drawText(line, {
                  x: block.x,
                  y: lineY,
                  size: fontSize,
                  font,
                  color: rgb(block.color.r, block.color.g, block.color.b),
                });
                lineIndex++;
              }
            }
          }
        }

        const modifiedPdf = await pdfDoc.save();
        return modifiedPdf;
      } finally {
        setIsBuilding(false);
      }
    },
    []
  );

  return { buildPdf, isBuilding };
}
