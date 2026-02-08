/**
 * Runs vitest and filters known Vite SSR teardown noise from stderr so the log stays clean.
 * Preserves exit code and forwards all other output.
 */
import { spawn } from 'node:child_process';

const TEARDOWN_MARKERS = ['transport was disconnected', 'Vite module runner has been closed'];

function lineStartsTeardownBlock(line) {
	return TEARDOWN_MARKERS.some((m) => line.includes(m));
}

function lineEndsBlock(line) {
	return line.trim() === '' || /^\d{1,2}:\d{2}:\d{2} (AM|PM) /.test(line);
}

const child = spawn('npm', ['run', 'test:unit', '--', '--run'], {
	stdio: ['inherit', 'inherit', 'pipe'],
	shell: true
});

let stderrBuffer = '';
let dropping = false;
child.stderr.on('data', (chunk) => {
	stderrBuffer += chunk.toString();
	const lines = stderrBuffer.split('\n');
	stderrBuffer = lines.pop() ?? '';
	for (const line of lines) {
		if (lineStartsTeardownBlock(line)) {
			dropping = true;
			continue;
		}
		if (dropping) {
			if (lineEndsBlock(line)) dropping = false;
			continue;
		}
		process.stderr.write(line + '\n');
	}
});
child.stderr.on('end', () => {
	if (!dropping && stderrBuffer && !lineStartsTeardownBlock(stderrBuffer))
		process.stderr.write(stderrBuffer);
});

child.on('close', (code) => {
	process.exit(code ?? 0);
});
