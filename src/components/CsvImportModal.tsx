import { useRef, type ChangeEvent } from 'react';
import { Download, FileUp, Loader2, X } from 'lucide-react';

type CsvImportModalProps = {
  title: string;
  description: string;
  sampleFilename: string;
  sampleCsv: string;
  isImporting: boolean;
  onClose: () => void;
  onImport: (event: ChangeEvent<HTMLInputElement>) => void | Promise<void>;
};

function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export default function CsvImportModal({
  title,
  description,
  sampleFilename,
  sampleCsv,
  isImporting,
  onClose,
  onImport,
}: CsvImportModalProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  return (
    <div className="fixed inset-0 z-[160] flex items-center justify-center bg-slate-950/45 px-4 py-6 backdrop-blur-sm">
      <button
        type="button"
        aria-label="Close CSV import"
        onClick={onClose}
        className="absolute inset-0 cursor-default"
      />
      <div className="relative max-h-[88vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">{title}</h2>
            <p className="mt-2 text-sm leading-6 text-gray-500">{description}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-gray-200 text-gray-500 transition hover:bg-gray-50 hover:text-gray-900"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-5 rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-400">Required headers</p>
          <p className="mt-2 break-words font-mono text-sm text-gray-800">{sampleCsv.split(/\r?\n/)[0]}</p>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => downloadCsv(sampleFilename, sampleCsv)}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
          >
            <Download className="h-4 w-4" />
            Download Sample CSV
          </button>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={isImporting}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#1381FF] px-4 py-3 text-sm font-medium text-white shadow-lg shadow-[#1381FF]/20 transition hover:bg-[#4a35e8] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isImporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />}
            Upload CSV
          </button>
        </div>

        <input
          ref={inputRef}
          type="file"
          accept=".csv,text/csv"
          onChange={onImport}
          className="hidden"
        />
      </div>
    </div>
  );
}
