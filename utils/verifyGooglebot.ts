// utils/verifyGooglebot.ts
// DNS-based Googlebot verification with TTL caching and in-flight deduplication

const CACHE_TTL_MS = 24 * 60 * 60 * 1000 // 24 hours

type CachedResult = {
  ok: boolean
  expires: number
}

// Simple in-memory caches (per edge instance)
const ipCache = new Map<string, CachedResult>()
const inFlight = new Map<string, Promise<boolean>>()

export async function isVerifiedGoogleBot(ip: string): Promise<boolean> {
  const now = Date.now()

  // 1. Cache check
  const cached = ipCache.get(ip)
  if (cached && cached.expires > now) {
    return cached.ok
  }
  if (cached && cached.expires <= now) {
    ipCache.delete(ip)
  }

  // 2. In-flight dedupe (prevent duplicate lookups for same IP)
  const existingPromise = inFlight.get(ip)
  if (existingPromise) return existingPromise

  const verificationPromise = (async () => {
    try {
      // IPv4 only
      if (!/^\d+\.\d+\.\d+\.\d+$/.test(ip)) return false

      // REVERSE LOOKUP (PTR)
      const reversedIp = ip.split('.').reverse().join('.') + '.in-addr.arpa'

      const ptrResponse = await fetch(
        `https://dns.google/resolve?name=${reversedIp}&type=PTR`
      )
      const ptrData = await ptrResponse.json()

      if (!ptrData.Answer || !Array.isArray(ptrData.Answer)) return false

      // Get the hostname (e.g., crawl-66-249-66-1.googlebot.com.)
      let hostname: string = ptrData.Answer[0].data

      // Normalize trailing dot
      if (hostname.endsWith('.')) hostname = hostname.slice(0, -1)

      // Domain must be googlebot.com, google.com, or googleusercontent.com
      const lower = hostname.toLowerCase()
      const isGoogleDomain =
        lower.endsWith('.googlebot.com') ||
        lower.endsWith('.google.com') ||
        lower.endsWith('.googleusercontent.com')

      if (!isGoogleDomain) {
        return false
      }

      // FORWARD LOOKUP (A)
      const aResponse = await fetch(
        `https://dns.google/resolve?name=${hostname}&type=A`
      )
      const aData = await aResponse.json()

      if (!aData.Answer || !Array.isArray(aData.Answer)) return false

      const match = aData.Answer.some(
        (record: { data: string }) => record.data === ip
      )

      return match
    } catch (err) {
      console.error('DoH verification failed:', err)
      return false // Fail closed
    }
  })()

  inFlight.set(ip, verificationPromise)

  const ok = await verificationPromise

  inFlight.delete(ip)
  ipCache.set(ip, { ok, expires: Date.now() + CACHE_TTL_MS })

  return ok
}
