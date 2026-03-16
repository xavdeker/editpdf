interface DownloadButtonProps {
  onClick: () => void;
  isBuilding: boolean;
  hasModifications: boolean;
}

export default function DownloadButton({
  onClick,
  isBuilding,
  hasModifications,
}: DownloadButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={isBuilding || !hasModifications}
      className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
        hasModifications
          ? 'bg-teal-600 text-white hover:bg-teal-700 active:scale-[0.98] shadow-sm hover:shadow-md'
          : 'bg-gray-100 text-gray-400 cursor-not-allowed'
      }`}
    >
      {isBuilding ? (
        <>
          <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Generation...
        </>
      ) : (
        <>
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
          </svg>
          Telecharger
        </>
      )}
    </button>
  );
}
