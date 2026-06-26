import { fetchStudyPgn, splitChapters } from './lib/study.mjs';
for (const id of process.argv.slice(2)) {
	const pgn = await fetchStudyPgn(id);
	const chapters = splitChapters(pgn);
	let withVars = 0, totalVarOpens = 0;
	for (const c of chapters) {
		const opens = (c.match(/\(/g) || []).length;
		if (opens) withVars++;
		totalVarOpens += opens;
	}
	console.log(`${id}: ${chapters.length} chapters, ${withVars} have variations, ${totalVarOpens} variation branches total`);
}
