/**
 * Client-side PDF/file helpers for Read-To-Me.
 * Converts File to base64 for API upload; no server-side PDF parsing.
 */

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB
const ALLOWED_PDF_TYPES = ['application/pdf'];

export interface FileToBase64Result {
	base64: string;
	mimeType: string;
	fileName: string;
	/** Approximate size in bytes */
	size: number;
}

/**
 * Read a File as base64 (for PDF or image upload).
 * Validates type and size; throws on invalid input.
 */
export function fileToBase64(file: File): Promise<FileToBase64Result> {
	if (file.size > MAX_FILE_SIZE_BYTES) {
		throw new Error(`File too large (max ${MAX_FILE_SIZE_BYTES / 1024 / 1024}MB)`);
	}
	const mimeType = file.type;
	if (!mimeType || (!mimeType.startsWith('image/') && !ALLOWED_PDF_TYPES.includes(mimeType))) {
		throw new Error('Unsupported file type. Use PDF or image (JPEG, PNG, WebP).');
	}
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => {
			const result = reader.result;
			if (typeof result !== 'string') {
				reject(new Error('FileReader did not return string'));
				return;
			}
			resolve({
				base64: result,
				mimeType,
				fileName: file.name,
				size: file.size
			});
		};
		reader.onerror = () => reject(new Error('Failed to read file'));
		reader.readAsDataURL(file);
	});
}
