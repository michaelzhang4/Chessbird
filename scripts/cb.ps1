# Chessbird helper — one command for importing content and publishing.
# Run via the wrapper:  scripts\cb.cmd <command> ...   (handles Node path + execution policy)
param(
	[Parameter(Position = 0)][string]$cmd,
	[Parameter(ValueFromRemainingArguments = $true)]$rest
)

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

# Prefer Node on PATH; otherwise fall back to the copy bundled with Zed.
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
	$zed = Join-Path $env:LOCALAPPDATA 'Zed\node'
	$dir = Get-ChildItem $zed -Directory -Filter 'node-*win-x64' -ErrorAction SilentlyContinue | Select-Object -First 1
	if ($dir) { $env:Path = "$($dir.FullName);$env:Path" }
}
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
	Write-Host "ERROR: Node.js not found. Install it from https://nodejs.org and reopen the terminal." -ForegroundColor Red
	exit 1
}

function Publish([string]$msg) {
	if (-not $msg) { $msg = 'Update content' }
	$env:BASE_PATH = '/Chessbird'
	npm run build
	if ($LASTEXITCODE -ne 0) { Write-Host 'Build failed — not deploying.' -ForegroundColor Red; exit 1 }

	git add -A
	if (git status --porcelain) { git commit -m $msg; git push origin main }
	else { Write-Host 'No source changes to commit.' }

	Push-Location build
	if (Test-Path .git) { Remove-Item -Recurse -Force .git }
	git init -q -b gh-pages
	git add -A
	git -c user.name='Michael Zhang' -c user.email='zhangmichael58@gmail.com' commit -q -m 'Deploy'
	git push -f https://github.com/michaelzhang4/Chessbird.git gh-pages
	Remove-Item -Recurse -Force .git
	Pop-Location
	Write-Host "`nDeployed -> https://michaelzhang4.github.io/Chessbird/" -ForegroundColor Green
}

switch ($cmd) {
	'study'      { node scripts/import-study.mjs @rest }
	'puzzles'    { node scripts/import-opening-puzzles.mjs @rest }
	'woodpecker' { node scripts/import-studies.mjs }
	'manifest'   { node scripts/rebuild-manifest.mjs }
	'preview'    { $env:BASE_PATH = ''; npm run dev }
	'deploy'     { Publish ($rest -join ' ') }
	default {
		Write-Host @'
Chessbird helper. Usage:  scripts\cb.cmd <command> [args]

  study   <studyId> <set-id> "Title"            Import a Lichess study as TACTICS (one puzzle per chapter)
  study   <studyId> <set-id> "Title" b expand   Import as a Black REPERTOIRE drill (full variation tree)
  puzzles "<OpeningTag>" <set-id> "Title" 500   Build a tactics set from the puzzle DB by opening tag
  woodpecker                                     Re-import every study listed in scripts\studies.json
  manifest                                       Rebuild the library index after adding/deleting set files
  preview                                        Run the app locally at http://localhost:5173
  deploy  "message"                              Build + publish to GitHub Pages

After any import, run:  scripts\cb.cmd deploy "what I added"
'@
	}
}
