<script lang="ts">
	import { onMount } from 'svelte';
	import { base } from '$app/paths';
	import ChessBoard from '$lib/board/ChessBoard.svelte';
	import { loadManifest, loadSetById } from '$lib/services/library';
	import { loadPool } from '$lib/services/pool';
	import { setsRepo } from '$lib/db';
	import { toast } from '$lib/stores/toast.svelte';
	import type { Puzzle } from '$lib/types';
	import type { SolveResult } from '$lib/board/boardController';

	interface Choice { id: string; title: string; count: number; source: string; }

	let loading = $state(true);
	let choices = $state<Choice[]>([]);
	let starting = $state(false);

	let queue = $state<Puzzle[]>([]);
	let idx = $state(0);
	let solved = $state(0);
	let label = $state('');
	let board = $state<ChessBoard>();

	const current = $derived(queue[idx]);

	onMount(async () => {
		const [m, mine] = await Promise.all([
			loadManifest().catch(() => ({ version: 1, sets: [] })),
			setsRepo.list()
		]);
		const seen = new Set<string>();
		choices = [...mine, ...m.sets]
			.map((s) => ({ id: s.id, title: s.title, count: s.count, source: s.source ?? 'library' }))
			.filter((c) => (seen.has(c.id) ? false : (seen.add(c.id), true)));
		loading = false;
	});

	function shuffle<T>(a: T[]): T[] {
		const r = [...a];
		for (let i = r.length - 1; i > 0; i--) {
			const j = Math.floor(Math.random() * (i + 1));
			[r[i], r[j]] = [r[j], r[i]];
		}
		return r;
	}

	async function startRandom() {
		starting = true;
		try {
			// random mix = all tactics sets (skip repertoire drills + the demo), deduped & shuffled
			const ids = choices
				.filter((c) => c.source !== 'lichess-repertoire' && c.source !== 'sample')
				.map((c) => c.id);
			const { puzzles } = await loadPool(ids);
			begin(shuffle(puzzles), 'Random mix');
		} finally {
			starting = false;
		}
	}

	async function startSet(c: Choice, shuffled: boolean) {
		starting = true;
		try {
			const set = await loadSetById(c.id);
			const pz = set?.puzzles ?? [];
			begin(shuffled ? shuffle(pz) : pz, c.title);
		} finally {
			starting = false;
		}
	}

	function begin(pz: Puzzle[], name: string) {
		queue = pz;
		idx = 0;
		solved = 0;
		label = name;
	}

	function next() {
		if (idx + 1 < queue.length) idx += 1;
		else {
			toast.success(`Done — ${solved}/${queue.length} solved`);
			exit();
		}
	}
	function onSolved(_r: SolveResult) {
		solved += 1;
		setTimeout(next, 500);
	}
	const onWrong = () => toast.error('Not the move — try again');
	function exit() {
		queue = [];
		idx = 0;
	}
</script>

{#if queue.length === 0}
	<!-- setup -->
	<header class="flex items-center gap-2 py-3">
		<a href="{base}/" class="rounded-lg p-2 text-neutral-500 hover:bg-neutral-100" aria-label="Back">←</a>
		<h1 class="truncate text-lg font-bold text-ink">Practice</h1>
	</header>

	{#if loading}
		<div class="mt-4 space-y-3">{#each [1, 2, 3] as i (i)}<div class="h-14 animate-pulse rounded-xl bg-neutral-200"></div>{/each}</div>
	{:else}
		<p class="px-1 text-sm text-neutral-600">Casual solving — no schedule, no tracking. Just reps.</p>

		<button
			onclick={startRandom}
			disabled={starting}
			class="mt-4 flex w-full items-center justify-between rounded-2xl bg-gradient-to-br from-brand-600 to-brand-700 p-5 text-white shadow-lg active:scale-[.99] disabled:opacity-60"
		>
			<span class="text-left">
				<span class="block text-lg font-bold">🎲 Random mix</span>
				<span class="text-sm text-white/85">Shuffled puzzles from all your tactics sets</span>
			</span>
			<span>→</span>
		</button>

		<h2 class="mb-2 mt-6 px-1 text-sm font-bold uppercase tracking-wide text-neutral-500">Or one pass through a set</h2>
		<div class="space-y-2">
			{#each choices as c (c.id)}
				<div class="flex items-center gap-2 rounded-xl border border-neutral-200 bg-white p-3 shadow-sm">
					<span class="min-w-0 flex-1">
						<span class="block truncate font-semibold text-ink">{c.title}</span>
						<span class="text-xs text-neutral-500">{c.count} puzzles</span>
					</span>
					<button onclick={() => startSet(c, false)} disabled={starting} class="rounded-lg border border-neutral-300 px-3 py-1.5 text-xs font-semibold text-neutral-700 active:bg-neutral-100 disabled:opacity-50">In order</button>
					<button onclick={() => startSet(c, true)} disabled={starting} class="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white active:bg-brand-700 disabled:opacity-50">Shuffle</button>
				</div>
			{/each}
		</div>
	{/if}
{:else if current}
	<!-- solving -->
	<header class="flex items-center justify-between py-2">
		<button onclick={exit} class="rounded-lg px-2 py-1 text-sm font-medium text-neutral-500 hover:bg-neutral-100">✕ Exit</button>
		<div class="text-center">
			<p class="truncate text-xs font-semibold text-neutral-500">{label}</p>
			<p class="text-[11px] text-neutral-400">{idx + 1}/{queue.length} · {solved} solved</p>
		</div>
		<div class="w-12"></div>
	</header>

	<ChessBoard bind:this={board} puzzle={current} onsolved={onSolved} onwrong={onWrong} />

	<div class="mt-3 flex items-center justify-between gap-2">
		<span class="rounded-full bg-neutral-100 px-3 py-1.5 text-sm font-medium text-neutral-600">
			{current.solverColor === 'w' ? 'White' : 'Black'} to move
		</span>
		<div class="flex gap-2">
			<button onclick={() => board?.showSolution()} class="rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm font-semibold text-neutral-700 active:bg-neutral-100">Solution</button>
			<button onclick={next} class="rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm font-semibold text-neutral-700 active:bg-neutral-100">Skip →</button>
		</div>
	</div>
{/if}
