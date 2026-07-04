import { Link } from 'react-router-dom';
import type { GameSummary } from '../../shared/schemas/index.js';
import type { TagFilter } from '../lib/library-filters';
import { fmt2, fmtPlayers, decodeHtml } from '../lib/format';
import { Tag } from './Tag';
import { buildCardTags } from './card-tags';

const ATTRIBUTES: { label: string; on: (g: GameSummary) => boolean }[] = [
  { label: 'Campaign', on: (g) => g.isCampaign },
  { label: 'Legacy', on: (g) => g.isLegacy },
  { label: 'Cooperative', on: (g) => g.isCooperative },
  { label: '18XX', on: (g) => g.is18xx },
];

interface GameCardProps {
  game: GameSummary;
  index: number;
  onTagClick: (tag: TagFilter) => void;
}

export function GameCard({ game, index, onTagClick }: GameCardProps) {
  const activeAttributes = ATTRIBUTES.filter((a) => a.on(game));
  return (
    <div className="flex flex-col overflow-hidden rounded-lg bg-gray-800 shadow">
      <Link
        to={`/details/${game.bggId}`}
        className="relative block h-[250px] bg-gray-700 bg-cover bg-center"
        style={game.image ? { backgroundImage: `url("${game.image}")` } : undefined}
      >
        <div className="absolute left-2 top-2 flex flex-wrap gap-1">
          {activeAttributes.map((a) => (
            <span key={a.label} className="rounded bg-cyan-900/80 px-1.5 py-0.5 text-[10px] font-semibold uppercase">
              {a.label}
            </span>
          ))}
        </div>
        {game.played && (
          <span className="absolute right-2 top-2 rounded-full bg-green-600 px-1.5 py-0.5 text-[10px] font-semibold" aria-label="Played">
            ✓ Played
          </span>
        )}
      </Link>

      <div className="flex flex-1 flex-col gap-2 p-3">
        <h3 className="truncate font-semibold" title={game.name}>{game.name}</h3>
        <p className="text-xs text-gray-400">
          {game.yearPublished ?? '—'} · {fmtPlayers(game.minPlayers, game.maxPlayers)} ·{' '}
          {game.playtime ?? '—'} min · ★{fmt2(game.ratingAvg)} · BGG {fmt2(game.ratingBavg)} ·{' '}
          ⚖ {fmt2(game.weightAvg)} · #{index}
        </p>
        {game.tagline && <p className="text-sm italic text-gray-300">{decodeHtml(game.tagline)}</p>}

        <div className="mt-auto flex flex-wrap gap-1 pt-1">
          {activeAttributes.map((a) => (
            <Tag key={`attr-${a.label}`} label={a.label} onClick={() => onTagClick({ type: 'Attribute', name: a.label })} />
          ))}
          {buildCardTags(game).map(({ label, tag }) => (
            <Tag key={`${tag.type}-${tag.name}`} label={label} title={`${tag.type}: ${label}`} onClick={() => onTagClick(tag)} />
          ))}
        </div>
      </div>
    </div>
  );
}
