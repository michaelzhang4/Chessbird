<script lang="ts">
	let {
		value = 0,
		max = 1,
		size = 76,
		stroke = 8,
		color = '#6a9c3b',
		track = '#e5e7eb',
		children
	}: {
		value?: number;
		max?: number;
		size?: number;
		stroke?: number;
		color?: string;
		track?: string;
		children?: import('svelte').Snippet;
	} = $props();

	const r = $derived((size - stroke) / 2);
	const circ = $derived(2 * Math.PI * r);
	const pct = $derived(max > 0 ? Math.min(1, Math.max(0, value / max)) : 0);
</script>

<div class="relative inline-grid place-items-center" style="width:{size}px;height:{size}px">
	<svg width={size} height={size} class="-rotate-90" viewBox="0 0 {size} {size}">
		<circle cx={size / 2} cy={size / 2} {r} fill="none" stroke={track} stroke-width={stroke} />
		<circle
			cx={size / 2}
			cy={size / 2}
			{r}
			fill="none"
			stroke={color}
			stroke-width={stroke}
			stroke-linecap="round"
			stroke-dasharray={circ}
			stroke-dashoffset={circ * (1 - pct)}
			style="transition: stroke-dashoffset .5s ease"
		/>
	</svg>
	<div class="absolute inset-0 grid place-items-center text-center">
		{@render children?.()}
	</div>
</div>
