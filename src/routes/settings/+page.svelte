<script lang="ts">
	import { onMount } from 'svelte';
	import { exportAll, importAll, wipeAll, isBackup } from '$lib/db';
	import { programsRepo } from '$lib/db';
	import { downloadJson } from '$lib/puzzles/exportSet';
	import { toast } from '$lib/stores/toast.svelte';

	let installed = $state(false);

	onMount(() => {
		installed =
			window.matchMedia('(display-mode: standalone)').matches ||
			(navigator as unknown as { standalone?: boolean }).standalone === true;
	});

	async function doExport() {
		const data = await exportAll();
		downloadJson(`woodpecker-backup-${new Date().toISOString().slice(0, 10)}.json`, data);
		toast.success('Backup downloaded');
	}

	async function onFile(e: Event & { currentTarget: HTMLInputElement }) {
		const file = e.currentTarget.files?.[0];
		if (!file) return;
		try {
			const data = JSON.parse(await file.text());
			if (!isBackup(data)) {
				toast.error('Not a Woodpecker backup file');
				return;
			}
			const replace = confirm('Replace ALL current data with this backup?\n\nOK = replace · Cancel = merge');
			await importAll(data, replace ? 'replace' : 'merge');
			toast.success('Backup imported — reload to refresh');
		} catch {
			toast.error('Could not read that file');
		} finally {
			e.currentTarget.value = '';
		}
	}

	async function endProgram() {
		if (!confirm('Set aside the current program? Your stats are kept; you can start fresh.')) return;
		await programsRepo.setActive(null);
		toast.success('Program set aside');
	}

	async function wipe() {
		if (!confirm('Delete ALL local data (sets, programs, attempts)? This cannot be undone.')) return;
		if (!confirm('Really wipe everything? Export a backup first if unsure.')) return;
		await wipeAll();
		toast.success('All data wiped');
	}
</script>

<header class="py-3">
	<h1 class="text-2xl font-extrabold tracking-tight text-ink">Settings</h1>
</header>

<section class="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
	<h2 class="text-sm font-bold uppercase tracking-wide text-neutral-500">Install</h2>
	{#if installed}
		<p class="mt-2 text-sm font-medium text-brand-700">✓ Running as an installed app — storage is durable.</p>
	{:else}
		<p class="mt-2 text-sm text-neutral-600">
			On iPhone: tap <span class="font-semibold">Share</span> → <span class="font-semibold">Add to Home Screen</span>. Installing
			keeps your progress safe across the 2.5-week program (Safari can otherwise clear site data).
		</p>
	{/if}
</section>

<section class="mt-3 rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
	<h2 class="text-sm font-bold uppercase tracking-wide text-neutral-500">Backup &amp; restore</h2>
	<p class="mt-1 text-xs text-neutral-500">Your progress lives only on this device — export regularly.</p>
	<div class="mt-3 flex gap-2">
		<button onclick={doExport} class="flex-1 rounded-2xl bg-brand-600 py-3 text-sm font-bold text-white active:bg-brand-700">Export all data</button>
		<label class="flex-1 cursor-pointer rounded-2xl border border-neutral-300 bg-white py-3 text-center text-sm font-semibold text-neutral-700 active:bg-neutral-100">
			Import backup
			<input type="file" accept="application/json,.json" class="hidden" onchange={onFile} />
		</label>
	</div>
</section>

<section class="mt-3 rounded-2xl border border-rose-200 bg-white p-4 shadow-sm">
	<h2 class="text-sm font-bold uppercase tracking-wide text-rose-500">Danger zone</h2>
	<div class="mt-3 space-y-2">
		<button onclick={endProgram} class="w-full rounded-2xl border border-neutral-300 py-2.5 text-sm font-semibold text-neutral-700 active:bg-neutral-100">Set aside current program</button>
		<button onclick={wipe} class="w-full rounded-2xl border border-rose-300 py-2.5 text-sm font-semibold text-rose-700 active:bg-rose-50">Wipe all data</button>
	</div>
</section>

<section class="mt-3 px-1 text-center text-xs text-neutral-400">
	<p>Woodpecker Chess · pieces: cburnett (BSD) · board theme inspired by chess.com green.</p>
</section>
