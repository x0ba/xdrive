import { readFile, writeFile } from 'node:fs/promises'

// Storybook's manager HTML uses relative URLs (`./sb-manager/...`).
// Insert the base href before those URLs so `/design` (no slash) resolves
// them under `/design/` instead of the site root.
const indexPath = new URL('../public/design/index.html', import.meta.url)
const baseTag = '<base href="/design/" />'
let html = await readFile(indexPath, 'utf8')
html = html.replaceAll(baseTag, '')
const head = html.match(/<head[^>]*>/)
if (!head) {
  throw new Error('Storybook index.html is missing <head>')
}
html = html.replace(head[0], `${head[0]}\n    ${baseTag}`)
await writeFile(indexPath, html)
