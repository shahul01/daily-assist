import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	writeAgent,
	ComposeEmailInputSchema,
	CorrectGrammarInputSchema,
	AdjustToneInputSchema,
	ExpandTextInputSchema,
	SummarizeInputSchema,
	GenerateTemplateInputSchema,
	SaveDraftInputSchema,
	RefineTextInputSchema,
	type Tone,
	type SummaryLength
} from '$lib/agents/writeAgent';

export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = (await request.json()) as Record<string, unknown>;
		const action = typeof body.action === 'string' ? body.action : '';

		switch (action) {
			case 'compose_email': {
				const parsed = ComposeEmailInputSchema.safeParse({
					topic: body.topic,
					tone: body.tone,
					context: body.context,
					userId: body.userId
				});
				if (!parsed.success) {
					return json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
				}
				const emailResult = await writeAgent.composeEmail(parsed.data);
				return json(emailResult);
			}

			case 'correct_grammar': {
				const parsed = CorrectGrammarInputSchema.safeParse({ text: body.text });
				if (!parsed.success) {
					return json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
				}
				const corrected = await writeAgent.correctGrammar(parsed.data.text);
				return json({ correctedText: corrected });
			}

			case 'adjust_tone': {
				const parsed = AdjustToneInputSchema.safeParse({
					text: body.text,
					targetTone: body.targetTone as Tone
				});
				if (!parsed.success) {
					return json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
				}
				const adjusted = await writeAgent.adjustTone(parsed.data.text, parsed.data.targetTone);
				return json({ adjustedText: adjusted });
			}

			case 'expand_text': {
				const parsed = ExpandTextInputSchema.safeParse({ notes: body.notes });
				if (!parsed.success) {
					return json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
				}
				const expanded = await writeAgent.expandText(parsed.data.notes);
				return json({ expandedText: expanded });
			}

			case 'summarize': {
				const parsed = SummarizeInputSchema.safeParse({
					text: body.text,
					length: body.length as SummaryLength
				});
				if (!parsed.success) {
					return json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
				}
				const summary = await writeAgent.summarize(parsed.data.text, parsed.data.length);
				return json({ summary });
			}

			case 'generate_template': {
				const parsed = GenerateTemplateInputSchema.safeParse({ purpose: body.purpose });
				if (!parsed.success) {
					return json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
				}
				const template = await writeAgent.generateTemplate(parsed.data.purpose);
				return json({ template });
			}

			case 'save_draft': {
				const parsed = SaveDraftInputSchema.safeParse({
					userId: body.userId,
					title: body.title,
					content: body.content,
					draftType: body.draftType,
					draftId: body.draftId
				});
				if (!parsed.success) {
					return json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
				}
				const draft = await writeAgent.saveDraft(parsed.data);
				return json(draft);
			}

			case 'load_drafts': {
				const userId = typeof body.userId === 'string' && body.userId ? body.userId : null;
				if (!userId) {
					return json({ error: 'userId required' }, { status: 400 });
				}
				const drafts = await writeAgent.loadDrafts(userId);
				return json({ drafts });
			}

			case 'refine_text': {
				const parsed = RefineTextInputSchema.safeParse({
					originalText: body.originalText,
					feedback: body.feedback,
					conversationHistory: body.conversationHistory
				});
				if (!parsed.success) {
					return json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
				}
				const refined = await writeAgent.refineText(parsed.data);
				return json({ refinedText: refined });
			}

			case 'learn_style': {
				const userId = typeof body.userId === 'string' && body.userId ? body.userId : null;
				const samples = Array.isArray(body.samples)
					? (body.samples as string[]).filter((s): s is string => typeof s === 'string')
					: [];
				if (!userId || samples.length === 0) {
					return json({ error: 'userId and non-empty samples array required' }, { status: 400 });
				}
				const profile = await writeAgent.learnUserStyle(userId, samples);
				return json({ profile });
			}

			case 'apply_style': {
				const text = typeof body.text === 'string' ? body.text : '';
				const userId = typeof body.userId === 'string' ? body.userId : '';
				if (!text || !userId) {
					return json({ error: 'text and userId required' }, { status: 400 });
				}
				const result = await writeAgent.applyUserStyle(text, userId);
				return json({ styledText: result });
			}

			default:
				return json(
					{
						error: 'Invalid or missing action',
						expected: [
							'compose_email',
							'correct_grammar',
							'adjust_tone',
							'expand_text',
							'summarize',
							'generate_template',
							'save_draft',
							'load_drafts',
							'refine_text',
							'learn_style',
							'apply_style'
						]
					},
					{ status: 400 }
				);
		}
	} catch (error) {
		console.error('Write agent API error:', error);
		return json(
			{
				error: 'Write agent failed',
				message: error instanceof Error ? error.message : 'Unknown error'
			},
			{ status: 500 }
		);
	}
};
