<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { base } from '$app/paths';
	import ChessBoard from '$lib/board/ChessBoard.svelte';
	import { loadSetById } from '$lib/services/library';
	import { startProgram } from '$lib/services/training';
	import { assessmentsRepo, programsRepo } from '$lib/db';
	import { toast } from '$lib/stores/toast.svelte';
	import {
		sample,
		buildAssessment,
		isSlow,
		ASSESS_SAMPLE_SIZE,
		VERDICT_LABEL,
		VERDICT_BLURB
	} from '$lib/eligibility/assess';
	import { formatClock } from '$lib/time';
	import type { AssessmentItem, AssessmentRun, Puzzle, PuzzleSet, Verdict } from '$lib/types';

	const id = page.params.id ?? '';
	let set = $state<PuzzleSet | null>(null);
	let phase = $state<'intro' | 'running' | 'done'>('intro');
	let sampled = $state<Puzzle[]>([]);
	let idx = $state(0);
	let result = $state<AssessmentRun | null>(null);
	let starting = $state(false);

	const items: AssessmentItem[] = [];
	let puzzleStart = 0;
	let msFirst = 0;
	let answered = false;

	let elapsed = $state(0);
	let ticker: ReturnType<typeof setInterval> | undefined;

	const current = $derived(phase === 'running' ? sampled[idx] : undefined);

	const VERDICT_STYLE: Record<Verdict, string> = {
		eligible: 'bg-brand-600',
		borderline: 'bg-amber-500',
		too_hard: 'bg-rose-600',
		too_easy: 'bg-sky-600'
	};

	onMount(async () => {
		set = await loadSetById(id);
	});

	function startRun() {
		if (!set) return;
		sampled = sample(set.puzzles, ASSESS_SAMPLE_SIZE);
		items.length = 0;
		idx = 0;
		phase = 'running';
	}

	$effect(() => {
		if (current) {
			answered = false;
			msFirst = 0;
			puzzleStart = Date.now();
			elapsed = 0;
			clearInterval(ticker);
			ticker = setInterval(() => (elapsed = Date.now() - puzzleStart), 250);
		}
	});

	function onFirstMove() {
		msFirst = Date.now() - puzzleStart;
	}

	function answer(correct: boolean) {
		if (answered || !current) return;
		answered = true;
		clearInterval(ticker);
		const t = msFirst || Date.now() - puzzleStart;
		items.push({
			puzzleId: current.id,
			firstTryCorrect: correct,
			msToFirstMove: t,
			msTotal: Date.now() - puzzleStart,
			slowFlag: isSlow(t)
		});
		setTimeout(advance, 400);
	}

	async function advance() {
		if (idx + 1 < sampled.length) {
			idx += 1;
		} else {
			result = buildAssessment({
				setId: set!.id,
				setTitle: set!.title,
				items: [...items],
				now: Date.now()
			});
			await assessmentsRepo.save(result);
			phase = 'done';
		}
	}

	async function start() {
		if (!set) return;
		const existing = await programsRepo.getActiveId();
		if (existing && existing !== id) {
			if (!confirm('Starting a new program will set aside your current one. Continue?')) return;
		}
		starting = true;
		try {
			await startProgram(set);
			toast.success('Program started — Cycle 1 begins now');
			goto(`${base}/program`);
		} finally {
			starting = false;
		}
	}
</script>

<header class="flex items-center gap-2 py-3">
	<a href="{base}/set/{id}" class="rounded-lg p-2 text-neutral-500 hover:bg-neutral-100" aria-label="Back">←</a>
	<h1 class="truncate text-lg font-bold text-ink">Eligibility check</h1>
</header>

{#if phase === 'intro'}
	<div class="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
		<p class="text-sm text-neutral-600">
			We'll show {Math.min(ASSESS_SAMPLE_SIZE, set?.count ?? 0)} random puzzles. Play your
			<span class="font-semibold">first move</span> quickly — don't calculate for minutes. The set is
			well-calibrated for Woodpecker if you get <span class="font-semibold">≥75% first-try</span>.
		</p>
		<button onclick={startRun} disabled={!set} class="mt-4 w-full rounded-2xl bg-brand-600 py-3.5 text-base font-bold text-white active:bg-brand-700 disabled:opacity-50">
			Start assessment
		</button>
	</div>
{:else if phase === 'running' && current}
	<div class="flex items-center justify-between py-1">
		<span class="text-sm font-semibold text-neutral-500">Puzzle {idx + 1} / {sampled.length}</span>
		<span class="font-mono text-sm tabular-nums text-neutral-700">{formatClock(elapsed)}</span>
	</div>
	<div class="mb-2 h-1.5 w-full overflow-hidden rounded-full bg-neutral-200">
		<div class="h-full bg-brand-500 transition-all" style="width:{((idx) / sampled.length) * 100}%"></div>
	</div>
	<ChessBoard puzzle={current} oncorrect={() => answer(true)} onwrong={() => answer(false)} onfirstmove={onFirstMove} />
	<p class="mt-3 text-center text-sm text-neutral-500">{current.solverColor === 'w' ? 'White' : 'Black'} to move — first try counts</p>
{:else if phase === 'done' && result}
	<div class="rounded-3xl border border-neutral-200 bg-white p-5 text-center shadow-sm">
		<span class="inline-block rounded-full {VERDICT_STYLE[result.verdict]} px-4 py-1.5 text-sm font-bold text-white">
			{VERDICT_LABEL[result.verdict]}
		</span>
		<p class="mx-auto mt-3 max-w-xs text-sm text-neutral-600">{VERDICT_BLURB[result.verdict]}</p>
		<div class="mt-4 grid grid-cols-3 gap-2 text-center">
			<div class="rounded-xl bg-neutral-50 py-3">
				<p class="text-xl font-bold text-ink">{Math.round(result.firstTryAccuracy * 100)}%</p>
				<p class="text-[11px] text-neutral-500">first try</p>
			</div>
			<div class="rounded-xl bg-neutral-50 py-3">
				<p class="text-xl font-bold text-ink">{formatClock(result.medianMsToFirstMove)}</p>
				<p class="text-[11px] text-neutral-500">median time</p>
			</div>
			<div class="rounded-xl bg-neutral-50 py-3">
				<p class="text-xl font-bold text-ink">{result.slowCount}</p>
				<p class="text-[11px] text-neutral-500">slow (&gt;90s)</p>
			</div>
		</div>
	</div>
	<div class="mt-5 space-y-2">
		<button onclick={start} disabled={starting} class="w-full rounded-2xl bg-brand-600 py-3.5 text-base font-bold text-white active:bg-brand-700 disabled:opacity-50">
			Start 18-day program
		</button>
		<button onclick={startRun} class="w-full rounded-2xl border border-neutral-300 bg-white py-3 text-sm font-semibold text-neutral-700 active:bg-neutral-100">
			Assess again
		</button>
	</div>
{/if}
