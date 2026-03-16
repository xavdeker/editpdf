import { useCallback, useRef, useState } from 'react';
import { formatFileSize, MAX_FILE_SIZE } from '../utils/pdfUtils';

interface UploadZoneProps {
  onFileSelected: (file: File) => void;
}

export default function UploadZone({ onFileSelected }: UploadZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const validateAndSelect = useCallback(
    (file: File) => {
      setError(null);

      if (file.type !== 'application/pdf') {
        setError('Seuls les fichiers PDF sont acceptes.');
        return;
      }

      if (file.size > MAX_FILE_SIZE) {
        setError('Le fichier depasse la limite de 20 Mo.');
        return;
      }

      setSelectedFile(file);
      onFileSelected(file);
    },
    [onFileSelected]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) validateAndSelect(file);
    },
    [validateAndSelect]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) validateAndSelect(file);
    },
    [validateAndSelect]
  );

  return (
    <div className="flex flex-col items-center justify-center h-full px-4">
      <div className="text-center mb-8">
        <h1 className="text-2xl font-bold text-gray-800 mb-2">
          Editez vos fichiers PDF
        </h1>
        <p className="text-gray-500 text-sm max-w-md mx-auto">
          Modifiez le texte de vos documents PDF directement dans votre navigateur. Aucune installation requise.
        </p>
      </div>

      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => inputRef.current?.click()}
        className={`relative w-full max-w-xl border-2 border-dashed rounded-2xl p-16 text-center cursor-pointer transition-all duration-200 ${
          isDragging
            ? 'border-teal-600 bg-teal-600/5 scale-[1.02] shadow-lg shadow-teal-600/10'
            : 'border-gray-300 bg-white hover:border-teal-600/50 hover:shadow-md'
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,application/pdf"
          onChange={handleInputChange}
          className="hidden"
        />

        <div className={`w-16 h-16 mx-auto mb-5 rounded-2xl flex items-center justify-center transition-colors duration-200 ${
          isDragging ? 'bg-teal-600 text-white' : 'bg-teal-600/10 text-teal-600'
        }`}>
          <svg
            className="w-8 h-8"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
            />
          </svg>
        </div>

        <p className="text-gray-700 font-semibold text-base mb-1.5">
          {isDragging ? 'Deposez votre fichier ici' : 'Glissez votre PDF ici'}
        </p>
        <p className="text-gray-400 text-sm mb-4">
          ou <span className="text-teal-600 font-medium hover:underline">parcourir vos fichiers</span>
        </p>

        <div className="flex items-center justify-center gap-4 text-xs text-gray-400">
          <span className="flex items-center gap-1">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
            </svg>
            Securise
          </span>
          <span className="w-px h-3 bg-gray-300" />
          <span>PDF uniquement</span>
          <span className="w-px h-3 bg-gray-300" />
          <span>Max 20 Mo</span>
        </div>
      </div>

      {error && (
        <div className="mt-4 px-4 py-2.5 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm flex items-center gap-2">
          <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
          </svg>
          {error}
        </div>
      )}

      {selectedFile && !error && (
        <div className="mt-4 px-4 py-3 bg-teal-50 border border-teal-200 rounded-lg flex items-center gap-3">
          <svg className="w-5 h-5 text-teal-600 shrink-0 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <div>
            <p className="text-sm font-medium text-teal-800">{selectedFile.name}</p>
            <p className="text-xs text-teal-600">{formatFileSize(selectedFile.size)} &middot; Chargement...</p>
          </div>
        </div>
      )}

      {/* Features */}
      <div className="mt-12 grid grid-cols-3 gap-6 max-w-xl w-full">
        {[
          { icon: 'M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10', title: 'Editer le texte', desc: 'Modifiez directement le contenu textuel' },
          { icon: 'M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15', title: 'Redimensionner', desc: 'Ajustez la taille des blocs de texte' },
          { icon: 'M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3', title: 'Telecharger', desc: 'Exportez le PDF modifie instantanement' },
        ].map((feature, i) => (
          <div key={i} className="text-center">
            <div className="w-10 h-10 mx-auto mb-2 rounded-xl bg-gray-100 text-gray-500 flex items-center justify-center">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d={feature.icon} />
              </svg>
            </div>
            <p className="text-sm font-medium text-gray-700">{feature.title}</p>
            <p className="text-xs text-gray-400 mt-0.5">{feature.desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
