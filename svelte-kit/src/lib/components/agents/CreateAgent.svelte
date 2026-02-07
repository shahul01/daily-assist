<script lang="ts">
	import type {
		GeneratedImage,
		GeneratedVideo,
		CharacterProfile,
		GenerationRecord
	} from '$lib/agents/createAgent';

	interface Props {
		userId?: string;
	}

	let { userId = 'anonymous' }: Props = $props();

	type Tab = 'image' | 'video' | 'profiles' | 'history';
	let activeTab = $state<Tab>('image');
	let prompt = $state('');
	let textInImage = $state('');
	let useTextInImage = $state(false);
	let resolution = $state<'1K' | '2K' | '4K'>('2K');
	let aspectRatio = $state<'1:1' | '16:9' | '9:16' | '4:3' | '3:4'>('1:1');
	let characterProfileId = $state<string | null>(null);
	let negativePrompt = $state('');
	let loading = $state(false);
	let error = $state('');
	let message = $state('');
	let lastImage = $state<GeneratedImage | null>(null);
	let lastVideo = $state<GeneratedVideo | null>(null);

	let videoDuration = $state<4 | 6 | 8>(8);
	let videoResolution = $state<'720p' | '1080p' | '4K'>('720p');
	let videoAspectRatio = $state<'16:9' | '9:16'>('16:9');
	let includeAudio = $state(true);
	let videoProgress = $state('');

	let profiles = $state<CharacterProfile[]>([]);
	let profileName = $state('');
	let profileDescription = $state('');
	let profileImages = $state<string[]>([]);
	let profileLoading = $state(false);

	let history = $state<GenerationRecord[]>([]);
	let historyLoading = $state(false);

	const RESOLUTIONS = ['1K', '2K', '4K'] as const;
	const ASPECT_RATIOS: Array<{ value: '1:1' | '16:9' | '9:16' | '4:3' | '3:4'; label: string }> = [
		{ value: '1:1', label: '1:1' },
		{ value: '16:9', label: '16:9' },
		{ value: '9:16', label: '9:16' },
		{ value: '4:3', label: '4:3' },
		{ value: '3:4', label: '3:4' }
	];

	async function callCreate(action: string, payload: Record<string, unknown>) {
		const res = await fetch('/api/agents/create', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ ...payload, action, userId })
		});
		const data = await res.json();
		if (!res.ok) throw new Error(data?.message ?? data?.error ?? 'Request failed');
		return data;
	}

	function setMessage(text: string, isError = false) {
		message = text;
		error = isError ? text : '';
		if (text && !isError) setTimeout(() => (message = ''), 4000);
	}

	async function generateImage() {
		if (!prompt.trim()) {
			setMessage('Enter a prompt', true);
			return;
		}
		loading = true;
		error = '';
		message = '';
		try {
			if (useTextInImage && textInImage.trim()) {
				const result = await callCreate('generateImageWithText', {
					prompt: prompt.trim(),
					textContent: textInImage.trim(),
					resolution,
					aspectRatio
				});
				lastImage = result;
				setMessage('Image generated. Expires in 3 days.');
				activeTab = 'history';
				loadHistory();
			} else {
				const result = await callCreate('generateImage', {
					prompt: prompt.trim(),
					resolution,
					aspectRatio,
					characterProfileId: characterProfileId ?? undefined,
					negativePrompt: negativePrompt.trim() || undefined
				});
				lastImage = result;
				setMessage('Image generated. Expires in 3 days.');
				activeTab = 'history';
				loadHistory();
			}
		} catch (e) {
			setMessage(e instanceof Error ? e.message : 'Generation failed', true);
		} finally {
			loading = false;
		}
	}

	async function generateVideo() {
		if (!prompt.trim()) {
			setMessage('Enter a prompt', true);
			return;
		}
		loading = true;
		error = '';
		message = '';
		videoProgress = 'Starting…';
		try {
			const result = await callCreate('generateVideo', {
				prompt: prompt.trim(),
				durationSeconds: videoDuration,
				resolution: videoResolution,
				aspectRatio: videoAspectRatio,
				characterProfileId: characterProfileId ?? undefined,
				includeAudio
			});
			lastVideo = result;
			videoProgress = '';
			setMessage('Video generated. Expires in 3 days.');
			activeTab = 'history';
			loadHistory();
		} catch (e) {
			videoProgress = '';
			setMessage(e instanceof Error ? e.message : 'Video generation failed', true);
		} finally {
			loading = false;
		}
	}

	async function loadProfiles() {
		try {
			const list = await callCreate('listCharacterProfiles', {});
			profiles = list;
		} catch {
			profiles = [];
		}
	}

	async function createProfile() {
		if (!profileName.trim() || profileImages.length === 0) {
			setMessage('Name and at least one reference image required', true);
			return;
		}
		profileLoading = true;
		error = '';
		try {
			await callCreate('createCharacterProfile', {
				name: profileName.trim(),
				description: profileDescription.trim() || undefined,
				referenceImagesBase64: profileImages
			});
			setMessage('Character profile created.');
			profileName = '';
			profileDescription = '';
			profileImages = [];
			loadProfiles();
		} catch (e) {
			setMessage(e instanceof Error ? e.message : 'Failed to create profile', true);
		} finally {
			profileLoading = false;
		}
	}

	function addProfileImage(e: Event) {
		const input = e.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file || !file.type.startsWith('image/')) return;
		const reader = new FileReader();
		reader.onload = () => {
			const data = reader.result as string;
			if (profileImages.length < 3) profileImages = [...profileImages, data];
		};
		reader.readAsDataURL(file);
		input.value = '';
	}

	async function loadHistory() {
		historyLoading = true;
		try {
			const list = await callCreate('getGenerationHistory', { limit: 30 });
			history = list;
		} catch {
			history = [];
		} finally {
			historyLoading = false;
		}
	}

	async function getDownloadUrl(id: string) {
		try {
			const { url } = await callCreate('getMediaDownloadUrl', { generationId: id });
			window.open(url, '_blank');
		} catch (e) {
			setMessage(e instanceof Error ? e.message : 'Download failed', true);
		}
	}

	async function deleteGeneration(id: string) {
		try {
			await callCreate('deleteGeneration', { generationId: id });
			setMessage('Deleted.');
			loadHistory();
		} catch (e) {
			setMessage(e instanceof Error ? e.message : 'Delete failed', true);
		}
	}

	function formatExpires(expiresAt: string | null): string {
		if (!expiresAt) return '—';
		const d = new Date(expiresAt);
		const now = new Date();
		const hours = (d.getTime() - now.getTime()) / (1000 * 60 * 60);
		if (hours < 0) return 'Expired';
		if (hours < 24) return `Expires in ${Math.round(hours)}h`;
		return `Expires in ${Math.round(hours / 24)} days`;
	}

	$effect(() => {
		if (activeTab === 'profiles') loadProfiles();
		if (activeTab === 'history') loadHistory();
	});
</script>

<div
	class="create-agent rounded-xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-700 dark:bg-neutral-900"
>
	<h2 class="mb-3 text-lg font-medium text-neutral-800 dark:text-neutral-200">Create-For-Me</h2>

	<div class="mb-3 flex flex-wrap gap-1 rounded-lg bg-neutral-100 p-1 dark:bg-neutral-800">
		<button
			type="button"
			onclick={() => (activeTab = 'image')}
			class="rounded-md px-3 py-1.5 text-sm font-medium transition {activeTab === 'image'
				? 'bg-white text-neutral-900 shadow dark:bg-neutral-700 dark:text-neutral-100'
				: 'text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-200'}"
		>
			Image
		</button>
		<button
			type="button"
			onclick={() => (activeTab = 'video')}
			class="rounded-md px-3 py-1.5 text-sm font-medium transition {activeTab === 'video'
				? 'bg-white text-neutral-900 shadow dark:bg-neutral-700 dark:text-neutral-100'
				: 'text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-200'}"
		>
			Video
		</button>
		<button
			type="button"
			onclick={() => (activeTab = 'profiles')}
			class="rounded-md px-3 py-1.5 text-sm font-medium transition {activeTab === 'profiles'
				? 'bg-white text-neutral-900 shadow dark:bg-neutral-700 dark:text-neutral-100'
				: 'text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-200'}"
		>
			Profiles
		</button>
		<button
			type="button"
			onclick={() => (activeTab = 'history')}
			class="rounded-md px-3 py-1.5 text-sm font-medium transition {activeTab === 'history'
				? 'bg-white text-neutral-900 shadow dark:bg-neutral-700 dark:text-neutral-100'
				: 'text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-200'}"
		>
			History
		</button>
	</div>

	{#if message}
		<p
			class="mb-3 rounded-lg border p-2 text-sm {error
				? 'border-red-300 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-900/20 dark:text-red-200'
				: 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-200'}"
			role="alert"
		>
			{message}
		</p>
	{/if}

	{#if activeTab === 'image'}
		<div class="space-y-3">
			<label
				for="create-image-prompt"
				class="block text-sm font-medium text-neutral-700 dark:text-neutral-300"
			>
				Prompt
			</label>
			<textarea
				id="create-image-prompt"
				bind:value={prompt}
				rows={3}
				class="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200"
				placeholder="Describe the image you want…"
			></textarea>
			<div class="flex flex-wrap gap-4">
				<div>
					<span class="text-xs font-medium text-neutral-500 dark:text-neutral-400">Resolution</span>
					<div class="mt-1 flex gap-1">
						{#each RESOLUTIONS as r (r)}
							<button
								type="button"
								onclick={() => (resolution = r)}
								class="rounded px-2 py-1 text-sm {resolution === r
									? 'bg-blue-600 text-white dark:bg-blue-500'
									: 'bg-neutral-200 dark:bg-neutral-700 dark:text-neutral-300'}"
							>
								{r}
							</button>
						{/each}
					</div>
				</div>
				<div>
					<span class="text-xs font-medium text-neutral-500 dark:text-neutral-400"
						>Aspect ratio</span
					>
					<div class="mt-1 flex flex-wrap gap-1">
						{#each ASPECT_RATIOS as ar (ar.value)}
							<button
								type="button"
								onclick={() => (aspectRatio = ar.value)}
								class="rounded px-2 py-1 text-sm {aspectRatio === ar.value
									? 'bg-blue-600 text-white dark:bg-blue-500'
									: 'bg-neutral-200 dark:bg-neutral-700 dark:text-neutral-300'}"
							>
								{ar.label}
							</button>
						{/each}
					</div>
				</div>
			</div>
			<label class="flex items-center gap-2 text-sm text-neutral-700 dark:text-neutral-300">
				<input
					type="checkbox"
					bind:checked={useTextInImage}
					class="rounded"
					aria-label="Include text in image"
				/>
				Include text in image
			</label>
			{#if useTextInImage}
				<input
					type="text"
					bind:value={textInImage}
					class="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200"
					placeholder="Text to render in the image (short works best)"
					maxlength="100"
				/>
			{/if}
			{#if profiles.length}
				<div>
					<label
						for="create-image-profile"
						class="text-xs font-medium text-neutral-500 dark:text-neutral-400"
						>Character profile</label
					>
					<select
						id="create-image-profile"
						bind:value={characterProfileId}
						class="mt-1 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200"
					>
						<option value={null}>None</option>
						{#each profiles as p (p.id)}
							<option value={p.id}>{p.name}</option>
						{/each}
					</select>
				</div>
			{/if}
			<label for="create-negative-prompt" class="sr-only">Negative prompt</label>
			<input
				id="create-negative-prompt"
				type="text"
				bind:value={negativePrompt}
				class="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200"
				placeholder="Negative prompt (optional)"
			/>
			<button
				type="button"
				onclick={generateImage}
				disabled={loading}
				class="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow hover:bg-blue-700 disabled:opacity-50 dark:bg-blue-500 dark:hover:bg-blue-600"
			>
				{loading ? 'Generating…' : 'Generate image'}
			</button>
			{#if lastImage}
				<p class="text-xs text-neutral-500 dark:text-neutral-400">
					Last image expires {new Date(lastImage.expiresAt).toLocaleString()}.
				</p>
			{/if}
		</div>
	{:else if activeTab === 'video'}
		<div class="space-y-3">
			<label
				for="create-video-prompt"
				class="block text-sm font-medium text-neutral-700 dark:text-neutral-300"
			>
				Prompt (add dialogue in quotes for audio)
			</label>
			<textarea
				id="create-video-prompt"
				bind:value={prompt}
				rows={3}
				class="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200"
				placeholder="E.g. A person smiling and saying 'I need help' in a calm voice."
			></textarea>
			<div class="flex flex-wrap gap-4">
				<div>
					<label
						for="create-video-duration"
						class="text-xs font-medium text-neutral-500 dark:text-neutral-400">Duration</label
					>
					<select
						id="create-video-duration"
						bind:value={videoDuration}
						class="mt-1 rounded border border-neutral-300 bg-white px-2 py-1 text-sm dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200"
					>
						<option value={4}>4 s</option>
						<option value={6}>6 s</option>
						<option value={8}>8 s</option>
					</select>
				</div>
				<div>
					<label
						for="create-video-resolution"
						class="text-xs font-medium text-neutral-500 dark:text-neutral-400">Resolution</label
					>
					<select
						id="create-video-resolution"
						bind:value={videoResolution}
						class="mt-1 rounded border border-neutral-300 bg-white px-2 py-1 text-sm dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200"
					>
						<option value="720p">720p</option>
						<option value="1080p">1080p</option>
						<option value="4K">4K</option>
					</select>
				</div>
				<div>
					<label
						for="create-video-aspect"
						class="text-xs font-medium text-neutral-500 dark:text-neutral-400">Aspect</label
					>
					<select
						id="create-video-aspect"
						bind:value={videoAspectRatio}
						class="mt-1 rounded border border-neutral-300 bg-white px-2 py-1 text-sm dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200"
					>
						<option value="16:9">16:9</option>
						<option value="9:16">9:16</option>
					</select>
				</div>
				<label class="flex items-center gap-2 text-sm text-neutral-700 dark:text-neutral-300">
					<input
						type="checkbox"
						bind:checked={includeAudio}
						class="rounded"
						aria-label="Include audio in video"
					/>
					Include audio
				</label>
			</div>
			{#if profiles.length}
				<div>
					<label
						for="create-video-profile"
						class="text-xs font-medium text-neutral-500 dark:text-neutral-400"
						>Character profile</label
					>
					<select
						id="create-video-profile"
						bind:value={characterProfileId}
						class="mt-1 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200"
					>
						<option value={null}>None</option>
						{#each profiles as p (p.id)}
							<option value={p.id}>{p.name}</option>
						{/each}
					</select>
				</div>
			{/if}
			{#if videoProgress}
				<p class="text-sm text-neutral-600 dark:text-neutral-400">{videoProgress}</p>
			{/if}
			<button
				type="button"
				onclick={generateVideo}
				disabled={loading}
				class="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow hover:bg-blue-700 disabled:opacity-50 dark:bg-blue-500 dark:hover:bg-blue-600"
			>
				{loading ? 'Generating video (may take 1–2 min)…' : 'Generate video'}
			</button>
			{#if lastVideo}
				<p class="text-xs text-neutral-500 dark:text-neutral-400">
					Last video expires {new Date(lastVideo.expiresAt).toLocaleString()}.
				</p>
			{/if}
		</div>
	{:else if activeTab === 'profiles'}
		<div class="space-y-4">
			<div
				class="rounded-lg border border-neutral-200 bg-neutral-50 p-3 dark:border-neutral-700 dark:bg-neutral-800/50"
			>
				<p class="mb-2 text-sm font-medium text-neutral-800 dark:text-neutral-200">New profile</p>
				<label for="create-profile-name" class="sr-only">Profile name</label>
				<input
					id="create-profile-name"
					type="text"
					bind:value={profileName}
					class="mb-2 w-full rounded border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200"
					placeholder="Profile name"
				/>
				<label for="create-profile-desc" class="sr-only">Description</label>
				<textarea
					id="create-profile-desc"
					bind:value={profileDescription}
					rows={2}
					class="mb-2 w-full rounded border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200"
					placeholder="Description (optional)"
				></textarea>
				<p class="mb-1 text-xs text-neutral-500 dark:text-neutral-400">
					Reference images (1–3) for character consistency
				</p>
				<input
					type="file"
					accept="image/*"
					onchange={addProfileImage}
					class="mb-2 block w-full text-sm text-neutral-600 dark:text-neutral-400"
				/>
				{#if profileImages.length}
					<div class="mb-2 flex gap-2">
						{#each profileImages as img, i (i)}
							<div class="relative">
								<img src={img} alt="Reference" class="h-16 w-16 rounded object-cover" />
								<button
									type="button"
									onclick={() => (profileImages = profileImages.filter((_, j) => j !== i))}
									class="absolute -top-1 -right-1 rounded-full bg-red-500 px-1.5 py-0.5 text-xs text-white"
									aria-label="Remove"
								>
									×
								</button>
							</div>
						{/each}
					</div>
				{/if}
				<button
					type="button"
					onclick={createProfile}
					disabled={profileLoading || !profileName.trim() || profileImages.length === 0}
					class="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50 dark:bg-emerald-500"
				>
					{profileLoading ? 'Creating…' : 'Create profile'}
				</button>
			</div>
			<div>
				<p class="mb-2 text-sm font-medium text-neutral-800 dark:text-neutral-200">Your profiles</p>
				{#if profiles.length === 0}
					<p class="text-sm text-neutral-500 dark:text-neutral-400">No profiles yet.</p>
				{:else}
					<ul class="space-y-2">
						{#each profiles as p (p.id)}
							<li
								class="rounded-lg border border-neutral-200 bg-white p-2 dark:border-neutral-700 dark:bg-neutral-800"
							>
								<span class="font-medium text-neutral-800 dark:text-neutral-200">{p.name}</span>
								{#if p.description}
									<p class="text-xs text-neutral-500 dark:text-neutral-400">{p.description}</p>
								{/if}
								<span class="text-xs text-neutral-400"
									>{p.referenceImages.length} reference image(s)</span
								>
							</li>
						{/each}
					</ul>
				{/if}
			</div>
		</div>
	{:else}
		<div class="space-y-3">
			<p class="text-sm text-neutral-600 dark:text-neutral-400">
				Media expires in 3 days. You will be notified before deletion.
			</p>
			{#if historyLoading}
				<p class="text-sm text-neutral-500 dark:text-neutral-400">Loading…</p>
			{:else if history.length === 0}
				<p class="text-sm text-neutral-500 dark:text-neutral-400">No generations yet.</p>
			{:else}
				<div class="grid grid-cols-2 gap-3 sm:grid-cols-3">
					{#each history as gen (gen.id)}
						{#if !gen.deleted}
							<div
								class="overflow-hidden rounded-lg border border-neutral-200 bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800"
							>
								{#if gen.type === 'image' && gen.resultStoragePath}
									<div class="aspect-square bg-neutral-200 dark:bg-neutral-700">
										<!-- Preview via download URL or placeholder -->
										<span class="flex h-full items-center justify-center text-xs text-neutral-500"
											>Image</span
										>
									</div>
								{:else if gen.type === 'video' && gen.resultStoragePath}
									<div class="aspect-video bg-neutral-200 dark:bg-neutral-700">
										<span class="flex h-full items-center justify-center text-xs text-neutral-500"
											>Video</span
										>
									</div>
								{/if}
								<div class="p-2">
									<p
										class="truncate text-xs text-neutral-600 dark:text-neutral-400"
										title={gen.prompt}
									>
										{gen.prompt || gen.type}
									</p>
									<p class="text-xs text-neutral-500 dark:text-neutral-400">
										{formatExpires(gen.expiresAt)}
									</p>
									<div class="mt-1 flex gap-1">
										<button
											type="button"
											onclick={() => getDownloadUrl(gen.id)}
											class="rounded bg-blue-600 px-2 py-1 text-xs text-white hover:bg-blue-700 dark:bg-blue-500"
										>
											Download
										</button>
										<button
											type="button"
											onclick={() => deleteGeneration(gen.id)}
											class="rounded border border-neutral-300 px-2 py-1 text-xs dark:border-neutral-600 dark:text-neutral-300"
										>
											Delete
										</button>
									</div>
								</div>
							</div>
						{/if}
					{/each}
				</div>
			{/if}
		</div>
	{/if}
</div>
