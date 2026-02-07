import fs from 'node:fs'
import path from 'node:path'

function existsDir(p) {
  try {
    return fs.existsSync(p) && fs.statSync(p).isDirectory()
  } catch {
    return false
  }
}

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true })
}

function findInputDir() {
  const root = process.cwd()
  const candidates = ['dataTask', 'data', path.join('public', 'dataTask'), path.join('public', 'data')]
  for (const rel of candidates) {
    const full = path.join(root, rel)
    if (existsDir(full)) return full
  }
  return null
}

function listDayFiles(dir) {
  return fs
    .readdirSync(dir)
    .filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
    .sort((a, b) => a.localeCompare(b))
}

function main() {
  const inputDir = findInputDir()
  if (!inputDir) {
    console.error('No input directory found. Expected one of: dataTask/, data/, public/dataTask/, public/data/')
    process.exit(1)
  }

  const root = process.cwd()
  const outDir = path.join(root, 'mem', 'raw', 'time_usage')
  ensureDir(outDir)

  const files = listDayFiles(inputDir)
  if (files.length === 0) {
    console.error(`No daily JSON files found in ${inputDir}`)
    process.exit(1)
  }

  let written = 0
  for (const file of files) {
    const src = path.join(inputDir, file)
    const date = file.replace('.json', '')
    const memPath = `/mem/raw/time_usage/${date}`
    const obj = JSON.parse(fs.readFileSync(src, 'utf8'))
    const out = {
      mem_path: memPath,
      ...obj,
    }
    const dst = path.join(outDir, file)
    fs.writeFileSync(dst, JSON.stringify(out, null, 2) + '\n', 'utf8')
    written++
  }

  console.log(`Synced ${written} day files to ${path.relative(root, outDir)}`)
}

main()

