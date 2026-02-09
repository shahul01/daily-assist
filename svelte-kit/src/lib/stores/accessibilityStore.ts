/**
 * Accessibility preferences (persisted to localStorage).
 * Applied as classes on document.documentElement for global reduced motion, font size, and focus.
 */

import { writable } from 'svelte/store';

export type FontSizePreference = 'normal' | 'large';
export type ReduceMotionPreference = 'system' | 'on' | 'off';

export interface AccessibilityState {
	fontSize: FontSizePreference;
	highContrast: boolean;
	reduceMotion: ReduceMotionPreference;
}

const STORAGE_KEY = 'dailyassist-accessibility';

const DEFAULT: AccessibilityState = {
	fontSize: 'normal',
	highContrast: false,
	reduceMotion: 'system'
};

function load(): AccessibilityState {
	if (typeof window === 'undefined') return DEFAULT;
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return DEFAULT;
		const parsed = JSON.parse(raw) as Partial<AccessibilityState>;
		return {
			fontSize: parsed.fontSize === 'large' ? 'large' : 'normal',
			highContrast: Boolean(parsed.highContrast),
			reduceMotion:
				parsed.reduceMotion === 'on' || parsed.reduceMotion === 'off'
					? parsed.reduceMotion
					: 'system'
		};
	} catch {
		return DEFAULT;
	}
}

function save(state: AccessibilityState): void {
	if (typeof window === 'undefined') return;
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
	} catch {
		// ignore
	}
}

function createStore() {
	const { subscribe, set, update } = writable<AccessibilityState>(DEFAULT);
	return {
		subscribe,
		setFontSize: (value: FontSizePreference) =>
			update((s) => {
				const next = { ...s, fontSize: value };
				save(next);
				return next;
			}),
		setHighContrast: (value: boolean) =>
			update((s) => {
				const next = { ...s, highContrast: value };
				save(next);
				return next;
			}),
		setReduceMotion: (value: ReduceMotionPreference) =>
			update((s) => {
				const next = { ...s, reduceMotion: value };
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

export const accessibilityStore = createStore();
