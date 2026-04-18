const fs = require('fs')
const ctx = fs.readFileSync('src/AppContext.ts', 'utf8')
const body = ctx.match(/export type AppContextValue = \{([\s\S]*?)\nexport /)[1]
const keys = new Set()
for (const line of body.split('\n')) {
  const m = line.match(/^\s+([a-zA-Z][a-zA-Z0-9]*)(\??):/)
  if (m) keys.add(m[1])
}
const slices = ['useGame', 'useProfile', 'useSocial', 'useQueue', 'useAppShell']
const inSlices = new Set()
for (const s of slices) {
  const sb = fs.readFileSync('src/contexts/' + s + '.ts', 'utf8')
  const matches = sb.match(/'[a-zA-Z][a-zA-Z0-9]*'/g) || []
  for (const x of matches) inSlices.add(x.slice(1, -1))
}
const missing = [...keys].filter((k) => !inSlices.has(k))
const extra = [...inSlices].filter((k) => !keys.has(k))
console.log('AppContextValue keys:', keys.size)
console.log('In slices:', inSlices.size)
console.log('Missing (' + missing.length + '):', missing.join(', '))
console.log('Extra (' + extra.length + '):', extra.join(', '))
