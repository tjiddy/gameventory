interface TagProps {
  label: string;
  title?: string;
  onClick?: () => void;
  onRemove?: () => void;
}

/** A small chip. Clickable (card tags → add filter) and/or removable (active filters). */
export function Tag({ label, title, onClick, onRemove }: TagProps) {
  return (
    <span
      title={title}
      className="inline-flex items-center gap-1 rounded-full bg-gray-700 px-2 py-0.5 text-xs text-gray-200"
    >
      {onClick ? (
        <button type="button" onClick={onClick} className="hover:text-cyan-400">
          {label}
        </button>
      ) : (
        <span>{label}</span>
      )}
      {onRemove && (
        <button type="button" onClick={onRemove} aria-label={`Remove ${label}`} className="text-gray-400 hover:text-white">
          ×
        </button>
      )}
    </span>
  );
}
