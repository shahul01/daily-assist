import { writable } from 'svelte/store';

export type ThemePreference = 'system' | 'light' | 'dark';

export interface ThemeState {
	mode: ThemePreference;
}

const STORAGE_KEY = 'dailyassist-theme';

const DEFAULT: ThemeState = {
	mode: 'system'
};

function load(): ThemeState {
	if (typeof window === 'undefined') return DEFAULT;
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return DEFAULT;
		const parsed = JSON.parse(raw) as Partial<ThemeState>;
		const mode: ThemePreference =
			parsed.mode === 'light' || parsed.mode === 'dark' || parsed.mode === 'system'
				? parsed.mode
				: 'system';
		return { mode };
	} catch {
		return DEFAULT;
	}
}

function save(state: ThemeState): void {
	if (typeof window === 'undefined') return;
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
	} catch {
		// ignore
	}
}

function createStore() {
	const { subscribe, set, update } = writable<ThemeState>(DEFAULT);

	return {
		subscribe,
		setMode: (mode: ThemePreference) =>
			update((state) => {
				const next: ThemeState = { ...state, mode };
				save(next);
				return next;
			}),
		init: () => {
			const loaded = load();
			set(loaded);
			return loaded;
		}
	};
}

export const themeStore = createStore();
