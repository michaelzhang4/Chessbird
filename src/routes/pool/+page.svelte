<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { base } from '$app/paths';
	import { loadManifest } from '$lib/services/library';
	import { loadSetById } from '$lib/services/library';
	import { dedupeByPosition, makePoolSet } from '$lib/services/pool';
	import { setsRepo } from '$lib/db';
	import { toast } from '$lib/stores/toast.svelte';
	import type { Puzzle, PuzzleSet } from '$lib/types';

	interface Choice { id: string; title: string; count: number; origin: 'library' | 'user'; }

	let loading = $state(true);
	let choices = $state<Choice[]>([]);
	let selected = $state<string[]>([]);
	let n = $state(100);
	let title = $state('');
	let creating = $state(false);

	// cache loaded puzzles per set id so re-toggling is instant
	const cache = new Map<string, Puzzle[]>();
	let pool = $state<Puzzle[]>([]);
	let raw = $state(0);
	let computing = $state(false);
	let nTouched = false;

	onMount(async () => {
		try {
			const [manifest, mine] = await Promise.all([
				loadManifest().catch(() => ({ version: 1, sets: [] })),
				setsRepo.list()
			]);
			const lib: Choice[] = manifest.sets
				.filter((s) => s.source !== 'sample')
				.map((s) => ({ id: s.id, title: s.title, count: s.count, origin: 'library' as const }));
			const user: Choice[] = mine
				.filter((s) => s.source !== 'pool')
				.map((s) => ({ id: s.id, title: s.title, count: s.count, origin: 'user' as const }));
			choices = [...user, ...lib];
		} finally {
			loading = false;
		}
	});

	async function getPuzzles(id: string): Promise<Puzzle[]> {
		if (cache.has(id)) return cache.get(id)!;
		const set = await loadSetById(id);
		const p = set?.puzzles ?? [];
		cache.set(id, p);
		return p;
	}

	function toggle(id: string) {
		selected = selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id];
	}
	const selectAll = () => (selected = choices.map((c) => c.id));
	const clear = () => (selected = []);

	// recompute the deduped pool whenever the selection changes (race-guarded)
	let token = 0;
	$effect(() => {
		const ids = selected;
		const my = ++token;
		if (ids.length === 0) { pool = []; raw = 0; return; }
		computing = true;
		(async () => {
			const lists = await Promise.all(ids.map(getPuzzles));
			if (my !== token) return; // a newer selection superseded us
			const all = lists.flat();
			raw = all.length;
			pool = dedupeByPosition(all);
			computing = false;
		})();
	});

	// keep N sensible as availability changes (until the user edits it)
	$effect(() => {
		const avail = pool.length;
		if (!nTouched) n = Math.min(100, avail) || 0;
		else if (n > avail) n = avail;
	});

	async function create() {
		if (pool.length === 0) return;
		creating = true;
		try {
			const set: PuzzleSet = makePoolSet(pool, n, title);
			await setsRepo.save(set);
			toast.success(`Created "${set.title}"`);
			goto(`${base}/set/${set.id}`);
		} finally {
			creating = false;
		}
	}
</script>

<header class="flex items-center gap-2 py-3">
	<a href="{base}/" class="rounded-lg p-2 text-neutral-500 hover:bg-neutral-100" aria-label="Back">←</a>
	<h1 class="truncate text-lg font-bold text-ink">Build a training pool</h1>
</header>

{#if loading}
	<div class="mt-4 space-y-3">
		{#each [1, 2, 3] as i (i)}<div class="h-14 animate-pulse rounded-xl bg-neutral-200"></div>{/each}
	</div>
{:else}
	<p class="px-1 text-sm text-neutral-600">
		Pick the sets you want to drill, choose how many puzzles, and we'll mix them into one
		randomized Woodpecker set. Duplicate positions across sets are merged automatically.
	</p>

	<div class="mt-3 flex items-center justify-between px-1">
		<h2 class="text-sm font-bold uppercase tracking-wide text-neutral-500">Sets</h2>
		<div class="flex gap-3 text-sm font-medium text-brand-700">
			<button onclick={selectAll}>Select all</button>
			<button onclick={clear} class="text-neutral-500">Clear</button>
		</div>
	</div>

	<div class="mt-2 space-y-2">
		{#each choices as c (c.id)}
			<label
				class="flex cursor-pointer items-center gap-3 rounded-xl border bg-white p-3 shadow-sm transition
				{selected.includes(c.id) ? 'border-brand-500 ring-1 ring-brand-500' : 'border-neutral-200'}"
			>
				<input
					type="checkbox"
					class="h-5 w-5 rounded text-brand-600"
					checked={selected.includes(c.id)}
					onchange={() => toggle(c.id)}
				/>
				<span class="min-w-0 flex-1">
					<span class="block truncate font-semibold text-ink">{c.title}</span>
					<span class="text-xs text-neutral-500">{c.count} puzzles</span>
				</span>
				{#if c.origin === 'user'}
					<span class="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">Mine</span>
				{/if}
			</label>
		{/each}
	</div>

	<!-- summary + create -->
	<div class="sticky bottom-20 mt-5 rounded-2xl border border-neutral-200 bg-white/95 p-4 shadow-lg backdrop-blur">
		<div class="flex items-baseline justify-between">
			<p class="text-sm text-neutral-600">
				{#if computing}Counting…{:else}
					<span class="text-lg font-bold text-ink">{pool.length}</span> unique puzzles
					{#if raw > pool.length}<span class="text-neutral-400"> ({raw - pool.length} dupes merged)</span>{/if}
				{/if}
			</p>
			<span class="text-xs text-neutral-400">{selected.length} sets</span>
		</div>

		<div class="mt-3">
			<label for="poolN" class="text-xs font-medium text-neutral-500">Puzzles in this pool</label>
			<div class="mt-1 flex items-center gap-3">
				<input
					id="poolN"
					type="range" min="1" max={Math.max(1, pool.length)} bind:value={n}
					oninput={() => (nTouched = true)}
					class="flex-1 accent-brand-600" disabled={pool.length === 0}
				/>
				<input
					type="number" min="1" max={pool.length} bind:value={n}
					oninput={() => (nTouched = true)}
					class="w-20 rounded-lg border border-neutral-300 px-2 py-1 text-right text-sm"
					disabled={pool.length === 0}
				/>
			</div>
		</div>

		<input
			bind:value={title}
			placeholder="Pool name (optional)"
			class="mt-3 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
		/>

		<button
			onclick={create}
			disabled={pool.length === 0 || creating || n < 1}
			class="mt-3 w-full rounded-2xl bg-brand-600 py-3.5 text-base font-bold text-white shadow-sm active:bg-brand-700 disabled:opacity-50"
		>
			{creating ? 'Creating…' : `Create pool of ${Math.min(n, pool.length) || 0} →`}
		</button>
	</div>
{/if}
