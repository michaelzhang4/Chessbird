<script lang="ts">
	import { goto } from '$app/navigation';
	import { base } from '$app/paths';
	import ChessBoard from '$lib/board/ChessBoard.svelte';
	import { parsePuzzles } from '$lib/puzzles/parseRouter';
	import { buildSet, trimTo, slugify } from '$lib/puzzles/set';
	import { buildSetFile, downloadJson } from '$lib/puzzles/exportSet';
	import { setsRepo } from '$lib/db';
	import { toast } from '$lib/stores/toast.svelte';
	import type { ParseFormat, ParseResult } from '$lib/puzzles/parse-types';
	import type { PuzzleSet } from '$lib/types';

	let text = $state('');
	let format = $state<'auto' | ParseFormat>('auto');
	let setupMoveFirst = $state(false);
	let title = $state('');
	let limit = $state(300);
	let parsed = $state<ParseResult | null>(null);
	let saving = $state(false);
	let previewIdx = $state(0);

	const FORMATS: { id: 'auto' | ParseFormat; label: string }[] = [
		{ id: 'auto', label: 'Auto' },
		{ id: 'lichess-csv', label: 'Lichess CSV' },
		{ id: 'fen-solution', label: 'FEN + moves' }
	];

	function doParse() {
		parsed = parsePuzzles(text, {
			format: format === 'auto' ? undefined : format,
			setupMoveFirst
		});
		previewIdx = 0;
		if (!title && parsed.puzzles.length) title = 'My set';
	}

	function currentSet(): PuzzleSet | null {
		if (!parsed || parsed.puzzles.length === 0) return null;
		return buildSet({
			id: slugify(title || 'untitled-set'),
			title: title || 'Untitled set',
			source: parsed.format,
			puzzles: trimTo(parsed.puzzles, limit)
		});
	}

	async function save() {
		const s = currentSet();
		if (!s) return;
		saving = true;
		try {
			await setsRepo.save(s);
			toast.success(`Saved “${s.title}” (${s.count})`);
			goto(`${base}/set/${s.id}`);
		} finally {
			saving = false;
		}
	}

	function exportJson() {
		const s = currentSet();
		if (!s) return;
		downloadJson(`${s.id}.json`, buildSetFile(s));
		toast.success('Exported JSON — commit it to static/data/sets to ship it');
	}
</script>

<header class="flex items-center gap-2 py-3">
	<a href="{base}/" class="rounded-lg p-2 text-neutral-500 hover:bg-neutral-100" aria-label="Back">←</a>
	<h1 class="text-lg font-bold text-ink">New set</h1>
</header>

<div class="flex gap-1 rounded-xl bg-neutral-100 p-1">
	{#each FORMATS as f (f.id)}
		<button
			onclick={() => (format = f.id)}
			class="flex-1 rounded-lg py-1.5 text-sm font-semibold transition"
			class:bg-white={format === f.id}
			class:shadow-sm={format === f.id}
			class:text-brand-700={format === f.id}
			class:text-neutral-500={format !== f.id}>{f.label}</button
		>
	{/each}
</div>

{#if format === 'fen-solution'}
	<label class="mt-2 flex items-center gap-2 px-1 text-sm text-neutral-600">
		<input type="checkbox" bind:checked={setupMoveFirst} class="rounded text-brand-600" />
		First move is the opponent's (Lichess-style setup move)
	</label>
{/if}

<textarea
	bind:value={text}
	rows="7"
	placeholder={'Paste here.\nLichess CSV: PuzzleId,FEN,Moves,Rating,...\nFEN + moves: <FEN>, e2e4 e7e5 ...'}
	class="mt-2 w-full rounded-2xl border-neutral-300 font-mono text-xs"
></textarea>

<button onclick={doParse} disabled={!text.trim()} class="mt-2 w-full rounded-2xl bg-neutral-800 py-3 text-sm font-bold text-white active:bg-neutral-900 disabled:opacity-40">
	Parse & validate
</button>

{#if parsed}
	<div class="mt-4 rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
		<div class="flex items-center justify-between">
			<p class="font-semibold text-ink">
				{parsed.puzzles.length} valid
				<span class="text-sm font-normal text-neutral-500">({parsed.format})</span>
			</p>
			{#if parsed.dropped > 0}<span class="text-xs text-neutral-400">{parsed.dropped} dupes removed</span>{/if}
		</div>

		{#if parsed.errors.length}
			<details class="mt-2 rounded-lg bg-amber-50 p-2 text-xs text-amber-800">
				<summary class="cursor-pointer font-medium">{parsed.errors.length} rows skipped</summary>
				<ul class="mt-1 space-y-0.5">
					{#each parsed.errors.slice(0, 8) as e (e.line)}
						<li>line {e.line}: {e.reason}</li>
					{/each}
					{#if parsed.errors.length > 8}<li>…and {parsed.errors.length - 8} more</li>{/if}
				</ul>
			</details>
		{/if}

		{#if parsed.puzzles.length}
			<div class="mt-3 grid grid-cols-2 gap-3">
				<label class="text-sm">
					<span class="text-neutral-500">Title</span>
					<input bind:value={title} class="mt-1 w-full rounded-xl border-neutral-300 text-sm" />
				</label>
				<label class="text-sm">
					<span class="text-neutral-500">Keep first N</span>
					<input type="number" bind:value={limit} min="1" class="mt-1 w-full rounded-xl border-neutral-300 text-sm" />
				</label>
			</div>

			<div class="mt-3">
				<ChessBoard puzzle={parsed.puzzles[previewIdx]} viewOnly />
				<button
					onclick={() => (previewIdx = (previewIdx + 1) % parsed!.puzzles.length)}
					class="mt-1 w-full text-center text-sm font-medium text-brand-700"
				>Preview next →</button>
			</div>

			<div class="mt-4 flex gap-2">
				<button onclick={save} disabled={saving} class="flex-1 rounded-2xl bg-brand-600 py-3 text-sm font-bold text-white active:bg-brand-700 disabled:opacity-50">Save to My sets</button>
				<button onclick={exportJson} class="flex-1 rounded-2xl border border-neutral-300 bg-white py-3 text-sm font-semibold text-neutral-700 active:bg-neutral-100">Export JSON</button>
			</div>
		{/if}
	</div>
{/if}
