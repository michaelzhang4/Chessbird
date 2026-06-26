/** Zod schemas for validating pasted/imported set files and full backups (zod v4). */
import { z } from 'zod';

export const colorSchema = z.enum(['w', 'b']);

export const puzzleSchema = z.object({
	id: z.string(),
	fen: z.string(),
	moves: z.array(z.string()).min(1),
	setupMoveFirst: z.boolean(),
	solverColor: colorSchema,
	rating: z.number().optional(),
	themes: z.array(z.string()).optional(),
	openingTags: z.array(z.string()).optional(),
	sourceUrl: z.string().optional(),
	source: z.string().optional()
});

export const setFileSchema = z.object({
	schema: z.literal('woodpecker-set@1'),
	id: z.string(),
	title: z.string(),
	description: z.string().optional(),
	createdAt: z.string(),
	source: z.string().optional(),
	puzzles: z.array(puzzleSchema).min(1)
});

export type SetFile = z.infer<typeof setFileSchema>;

/** Manifest of the shipped library (static/data/manifest.json). */
export const manifestEntrySchema = z.object({
	id: z.string(),
	title: z.string(),
	file: z.string(),
	count: z.number(),
	description: z.string().optional(),
	ratingRange: z.tuple([z.number(), z.number()]).optional(),
	themes: z.array(z.string()).optional(),
	source: z.string().optional()
});

export const manifestSchema = z.object({
	version: z.number(),
	sets: z.array(manifestEntrySchema)
});

export type ManifestEntry = z.infer<typeof manifestEntrySchema>;
export type Manifest = z.infer<typeof manifestSchema>;

/** Flatten a ZodError into short, line-oriented messages for the UI. */
export function zodIssues(err: z.ZodError): string[] {
	return err.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`);
}
