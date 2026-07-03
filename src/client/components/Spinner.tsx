export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 p-8 text-gray-400" role="status">
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-gray-600 border-t-cyan-400" />
      {label && <span>{label}</span>}
    </div>
  );
}
