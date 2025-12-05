#!/usr/bin/env node
// scripts/prebuild-ranges.mjs
// Fetches Google's IP ranges at build time and generates a static TypeScript file

const RANGES_URL = 'https://developers.google.com/static/search/apis/ipranges/googlebot.json'
const OUTPUT_PATH = './utils/googlebot-ranges.generated.ts'

import { writeFileSync } from 'fs'

async function main() {
  console.log('[Prebuild] Fetching Googlebot ranges from', RANGES_URL)

  const res = await fetch(RANGES_URL)
  if (!res.ok) {
    throw new Error(`Failed to fetch: ${res.status} ${res.statusText}`)
  }

  const data = await res.json()

  const ipv4Prefixes = []
  const ipv6Prefixes = []

  for (const prefix of data.prefixes || []) {
    if (prefix.ipv4Prefix) {
      ipv4Prefixes.push(prefix.ipv4Prefix)
    }
    if (prefix.ipv6Prefix) {
      ipv6Prefixes.push(prefix.ipv6Prefix)
    }
  }

  const generated = `// AUTO-GENERATED FILE - DO NOT EDIT
// Generated at: ${new Date().toISOString()}
// Source: ${RANGES_URL}

export const IPV4_PREFIXES: string[] = ${JSON.stringify(ipv4Prefixes, null, 2)}

export const IPV6_PREFIXES: string[] = ${JSON.stringify(ipv6Prefixes, null, 2)}
`

  writeFileSync(OUTPUT_PATH, generated)
  console.log(`[Prebuild] Generated ${OUTPUT_PATH}`)
  console.log(`[Prebuild] ${ipv4Prefixes.length} IPv4 prefixes, ${ipv6Prefixes.length} IPv6 prefixes`)
}

main().catch((err) => {
  console.error('[Prebuild] Error:', err.message)
  process.exit(1)
})
