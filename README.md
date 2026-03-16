# PDFEdit - Editeur PDF en ligne

Application web 100% client-side pour editer des fichiers PDF directement dans le navigateur. Aucune donnee n'est envoyee a un serveur.

## Fonctionnalites

- **Upload PDF** : glisser-deposer ou selection de fichier (max 20 Mo)
- **Visualisation** : rendu haute resolution avec navigation par pages et zoom
- **Edition de texte** : modification in-place avec preservation de la police, du gras, de l'italique et de la couleur d'origine
- **Ajout de texte** : insertion de nouveaux blocs de texte
- **Gomme** : suppression de blocs de texte existants
- **Surlignage** : annotation par rectangles colores
- **Crayon** : dessin libre sur le PDF
- **Formatage** : changement de police (55+ polices web), taille, gras, italique
- **Export PDF** : telechargement du PDF modifie avec toutes les modifications integrees
- **Detection des PDFs scannes** : avertissement si le PDF ne contient que des images

## Stack technique

- **React 19** + **TypeScript**
- **Vite 8** (build + dev server)
- **Tailwind CSS 3** (styling)
- **pdfjs-dist 3.11** (rendu et extraction de texte)
- **pdf-lib** (generation du PDF modifie)
- **react-hot-toast** (notifications)

## Installation

```bash
npm install
```

## Developpement

```bash
npm run dev
```

L'application est accessible sur `http://localhost:5173`.

## Build

```bash
npm run build
```

Les fichiers de production sont generes dans le dossier `dist/`.

## Architecture

```
src/
  components/
    UploadZone.tsx         # Zone de depot de fichier (drag & drop)
    EditorLayout.tsx       # Layout principal (toolbar, thumbnails, viewer)
    PdfViewer.tsx          # Rendu canvas + overlays d'edition in-place
    PageThumbnails.tsx     # Miniatures des pages dans le sidebar
    DownloadButton.tsx     # Bouton de telechargement
  hooks/
    usePdfParser.ts        # Extraction texte, polices, couleurs depuis le PDF
    usePdfBuilder.ts       # Reconstruction du PDF modifie avec pdf-lib
  utils/
    pdfUtils.ts            # Utilitaires (detection modifications, mapping polices)
    pdfWorker.ts           # Configuration du worker pdfjs
  types/
    pdf.types.ts           # Types TypeScript
  App.tsx                  # Composant racine
  main.tsx                 # Point d'entree
```

## Limitations connues

- **PDFs scannes** : les PDFs image ne peuvent pas etre edites (detection automatique)
- **Polices** : pdf-lib utilise les 14 polices PDF standard — le texte modifie est mappe vers la police standard la plus proche
- **Fond colore** : la couverture du texte original echantillonne la couleur de fond pour s'adapter, mais peut etre imparfaite sur des fonds complexes (degradés, images)

## Licence

MIT
