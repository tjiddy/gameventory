import type { ReactNode } from 'react';
import type { GameDetail } from '../../shared/schemas/index.js';
import { fmt2, fmtInt, fmtPlayers, fmtPlaytime } from '../lib/format';

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex justify-between gap-4 border-b border-gray-700/60 py-1 text-sm">
      <dt className="text-gray-400">{label}</dt>
      <dd className="text-right">{children}</dd>
    </div>
  );
}

const yesNo = (b: boolean): string => (b ? 'Yes' : 'No');
const list = (arr: string[]): string => (arr.length ? arr.join(', ') : '—');

/** The ordered details field list (MIGRATION-PLAN §3.3), used for base games and expansions. */
export function DetailPanel({ game }: { game: GameDetail }) {
  return (
    <dl className="w-full">
      <Field label="Year Published">{game.yearPublished ?? '—'}</Field>
      <Field label="Played">{yesNo(game.played)}</Field>
      <Field label="Player Count">{fmtPlayers(game.minPlayers, game.maxPlayers)}</Field>
      <Field label="Playtime">{fmtPlaytime(game.playtime, game.minPlaytime, game.maxPlaytime)}</Field>
      <Field label="Rating">
        {fmt2(game.ratingAvg)} ({fmtInt(game.ratingVotes)} votes)
      </Field>
      <Field label="Rating (Bayesian)">{fmt2(game.ratingBavg)}</Field>
      <Field label="Rating Std Dev">{fmt2(game.ratingStdev)}</Field>
      <Field label="Weight">
        {fmt2(game.weightAvg)} ({fmtInt(game.weightVotes)} votes)
      </Field>
      <Field label="Cooperative / Legacy / Campaign / 18xx">
        {`${yesNo(game.isCooperative)} / ${yesNo(game.isLegacy)} / ${yesNo(game.isCampaign)} / ${yesNo(game.is18xx)}`}
      </Field>
      <Field label="Designer">{list(game.designers)}</Field>
      <Field label="Publisher">{list(game.publishers)}</Field>
      <Field label="Mechanics">{list(game.mechanics)}</Field>
      <Field label="Families">{list(game.families)}</Field>
      <Field label="Categories">{list(game.categories)}</Field>
    </dl>
  );
}
