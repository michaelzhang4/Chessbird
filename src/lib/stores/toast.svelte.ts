export type ToastKind = 'info' | 'success' | 'error';
export interface ToastItem {
	id: number;
	msg: string;
	kind: ToastKind;
}

class ToastStore {
	items = $state<ToastItem[]>([]);
	private n = 0;

	show(msg: string, kind: ToastKind = 'info', ms = 2400) {
		const id = ++this.n;
		this.items = [...this.items, { id, msg, kind }];
		setTimeout(() => this.dismiss(id), ms);
	}
	success(msg: string) {
		this.show(msg, 'success');
	}
	error(msg: string) {
		this.show(msg, 'error', 3600);
	}
	dismiss(id: number) {
		this.items = this.items.filter((t) => t.id !== id);
	}
}

export const toast = new ToastStore();
