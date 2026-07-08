import { useState } from 'react';
import type { ExpansionSummary } from '../../shared/schemas/index.js';
import { isPromo } from '../../shared/promo.js';
import { fmt2, decodeHtml } from '../lib/format';

function ExpansionRow({ exp, onOpen }: { exp: ExpansionSummary; onOpen: (bggId: number) => void }) {
  return (
    <button
      type="button"
      onClick={() => onOpen(exp.bggId)}
      className="flex w-full gap-3 rounded-lg bg-gray-800 p-3 text-left hover:bg-gray-700"
    >
      <div
        className={`h-[200px] w-[150px] shrink-0 rounded bg-gray-700 bg-cover bg-top ${exp.owned ? '' : 'grayscale'}`}
        style={exp.image ? { backgroundImage: `url("${exp.image}")` } : undefined}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          {exp.played && <span className="rounded-full bg-green-600 px-1.5 py-0.5 text-[10px]">✓</span>}
          <h4 className="font-semibold">
            {exp.name}
            {exp.yearPublished ? ` (${exp.yearPublished})` : ''}
          </h4>
        </div>
        {exp.hydrated ? (
          <>
            <p className="text-xs text-gray-400">★{fmt2(exp.ratingAvg)} · ⚖ {fmt2(exp.weightAvg)}</p>
            {exp.description && (
              <p className="mt-1 max-h-52 overflow-hidden text-sm text-gray-300">{decodeHtml(exp.description)}</p>
            )}
          </>
        ) : (
          <p className="mt-1 text-xs italic text-gray-500">Details loading…</p>
        )}
      </div>
    </button>
  );
}

/** Expansions list with the promo hide/show toggle (ledger H / §3.3). */
export function ExpansionsSection({
  expansions,
  onOpen,
}: {
  expansions: ExpansionSummary[];
  onOpen: (bggId: number) => void;
}) {
  const [showPromos, setShowPromos] = useState(false);
  if (expansions.length === 0) return null;

  const promos = expansions.filter((e) => isPromo(e.name, e.description));
  const hasPromos = promos.length > 0;
  const visible = showPromos ? expansions : expansions.filter((e) => !isPromo(e.name, e.description));

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Expansions</h3>
        {hasPromos && (
          <button type="button" onClick={() => setShowPromos((s) => !s)} className="rounded bg-gray-800 px-3 py-1 text-sm">
            {showPromos ? 'Promos Shown' : 'Promos Hidden'}
          </button>
        )}
      </div>
      <div className="flex flex-col gap-3">
        {visible.map((exp) => (
          <ExpansionRow key={exp.bggId} exp={exp} onOpen={onOpen} />
        ))}
      </div>
    </section>
  );
}
