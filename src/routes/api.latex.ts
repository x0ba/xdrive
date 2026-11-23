import { execFile } from 'node:child_process'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { createFileRoute } from '@tanstack/react-router'

const execFileAsync = promisify(execFile)

type NativeEngine = 'pdflatex' | 'xelatex' | 'lualatex'

async function hasCommand(cmd: string): Promise<boolean> {
  try {
    await execFileAsync('which', [cmd], { timeout: 2000 })
    return true
  } catch {
    return false
  }
}

async function detectEngines(): Promise<NativeEngine[]> {
  const candidates: NativeEngine[] = ['pdflatex', 'xelatex', 'lualatex']
  const checks = await Promise.all(
    candidates.map(async (cmd) => ((await hasCommand(cmd)) ? cmd : null)),
  )
  return checks.filter((c): c is NativeEngine => c !== null)
}

function isSafeRelativePath(filePath: string): boolean {
  if (!filePath || filePath.startsWith('/') || filePath.includes('..')) {
    return false
  }
  return /^[A-Za-z0-9._/-]+$/.test(filePath)
}

export async function GET() {
  const availableEngines = await detectEngines()
  return Response.json(
    { ok: true, availableEngines },
    { headers: { 'cache-control': 'no-store' } },
  )
}

export async function POST({ request }: { request: Request }) {
  let body: {
    engine?: NativeEngine
    mainFile?: string
    files?: Array<{ path: string; content: string }>
  }
  try {
    body = (await request.json()) as typeof body
  } catch {
    return Response.json(
      { ok: false, available: false, error: 'Invalid JSON request body' },
      { status: 400 },
    )
  }

  const engine = body.engine ?? 'pdflatex'
  if (!['pdflatex', 'xelatex', 'lualatex'].includes(engine)) {
    return Response.json(
      { ok: false, available: false, error: `Unsupported engine "${engine}"` },
      { status: 400 },
    )
  }

  const available = await hasCommand(engine)
  if (!available) {
    return Response.json(
      {
        ok: false,
        available: false,
        error: `${engine} is not installed on this host. Using built-in xDrive TeX compiler.`,
      },
      { status: 503 },
    )
  }

  const mainFile = body.mainFile || 'main.tex'
  const files = Array.isArray(body.files) ? body.files : []
  if (!isSafeRelativePath(mainFile) || files.length === 0) {
    return Response.json(
      { ok: false, available: true, error: 'Valid mainFile and files are required' },
      { status: 400 },
    )
  }

  const workDir = await mkdtemp(path.join(tmpdir(), 'xdrive-latex-'))
  const startMs = Date.now()
  try {
    for (const file of files) {
      if (!isSafeRelativePath(file.path)) continue
      const target = path.resolve(workDir, file.path)
      if (!target.startsWith(workDir)) continue
      await mkdir(path.dirname(target), { recursive: true })
      await writeFile(target, String(file.content), 'utf8')
    }

    const args = [
      '-interaction=nonstopmode',
      '-halt-on-error',
      '-no-shell-escape',
      mainFile,
    ]
    let log = ''
    try {
      const run1 = await execFileAsync(engine, args, {
        cwd: workDir,
        timeout: 20000,
        maxBuffer: 4 * 1024 * 1024,
      })
      log = `${run1.stdout}\n${run1.stderr}`
      // Second pass for references
      const run2 = await execFileAsync(engine, args, {
        cwd: workDir,
        timeout: 20000,
        maxBuffer: 4 * 1024 * 1024,
      })
      log = `${run2.stdout}\n${run2.stderr}`
    } catch (err) {
      const execErr = err as { stdout?: string; stderr?: string; message?: string }
      log = `${execErr.stdout ?? ''}\n${execErr.stderr ?? ''}\n${execErr.message ?? ''}`
      return Response.json(
        {
          ok: false,
          available: true,
          error: `${engine} compilation failed`,
          log,
          durationMs: Date.now() - startMs,
        },
        { status: 422 },
      )
    }

    const pdfName = mainFile.replace(/\.tex$/i, '.pdf')
    const pdfBuffer = await readFile(path.resolve(workDir, pdfName))
    return Response.json({
      ok: true,
      available: true,
      pdfBase64: pdfBuffer.toString('base64'),
      log,
      durationMs: Date.now() - startMs,
    })
  } finally {
    await rm(workDir, { recursive: true, force: true })
  }
}

export const Route = createFileRoute('/api/latex')({
  server: {
    handlers: {
      GET,
      POST,
    },
  },
})
