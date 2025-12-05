// utils/googlebotRanges.ts
// Fast Googlebot verification using Google's official IP range JSON
// CIDR RANGE CHECK (Fast Path ~0ms, no network I/O)

const RANGES_URL = 'https://developers.google.com/static/search/apis/ipranges/googlebot.json'
const RANGES_TTL_MS = 10 * 60 * 1000 // 10 minutes

// IPv4 range: network + mask as 32-bit unsigned integers
type IPv4Range = { network: number; mask: number }

// IPv6 range: network + mask as BigInt (128-bit)
type IPv6Range = { network: bigint; prefixLen: number }

// In-memory cached ranges
let ipv4Ranges: IPv4Range[] = []
let ipv6Ranges: IPv6Range[] = []
let rangesExpires = 0
let initialLoadPromise: Promise<void> | null = null

// --- IPv4 helpers ---

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split('.')
  if (parts.length !== 4) return null
  const nums = parts.map((p) => Number(p))
  if (nums.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null
  return ((nums[0] << 24) | (nums[1] << 16) | (nums[2] << 8) | nums[3]) >>> 0
}

function parseIPv4Cidr(cidr: string): IPv4Range | null {
  const [ip, bitsStr] = cidr.split('/')
  const bits = Number(bitsStr)
  if (!ip || !Number.isInteger(bits) || bits < 0 || bits > 32) return null
  const ipInt = ipv4ToInt(ip)
  if (ipInt == null) return null
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0
  const network = ipInt & mask
  return { network, mask }
}

function ipv4InRange(ipInt: number, range: IPv4Range): boolean {
  return (ipInt & range.mask) === range.network
}

// --- IPv6 helpers ---

function ipv6ToBigInt(ip: string): bigint | null {
  // Expand :: notation
  let expanded = ip
  if (ip.includes('::')) {
    const parts = ip.split('::')
    if (parts.length > 2) return null // invalid: multiple ::
    const left = parts[0] ? parts[0].split(':') : []
    const right = parts[1] ? parts[1].split(':') : []
    const missing = 8 - left.length - right.length
    if (missing < 0) return null
    const middle = Array(missing).fill('0')
    expanded = [...left, ...middle, ...right].join(':')
  }

  const segments = expanded.split(':')
  if (segments.length !== 8) return null

  let result = BigInt(0)
  for (const seg of segments) {
    const val = parseInt(seg || '0', 16)
    if (isNaN(val) || val < 0 || val > 0xffff) return null
    result = (result << BigInt(16)) | BigInt(val)
  }
  return result
}

function parseIPv6Cidr(cidr: string): IPv6Range | null {
  const slashIdx = cidr.lastIndexOf('/')
  if (slashIdx === -1) return null
  const ip = cidr.substring(0, slashIdx)
  const prefixLen = Number(cidr.substring(slashIdx + 1))
  if (!Number.isInteger(prefixLen) || prefixLen < 0 || prefixLen > 128) return null

  const ipBigInt = ipv6ToBigInt(ip)
  if (ipBigInt == null) return null

  // Calculate network by masking
  const shift = BigInt(128 - prefixLen)
  const network = prefixLen === 0 ? BigInt(0) : (ipBigInt >> shift) << shift

  return { network, prefixLen }
}

function ipv6InRange(ipBigInt: bigint, range: IPv6Range): boolean {
  if (range.prefixLen === 0) return true
  const shift = BigInt(128 - range.prefixLen)
  const maskedIp = (ipBigInt >> shift) << shift
  return maskedIp === range.network
}

// --- Detection helpers ---

function isIPv4(ip: string): boolean {
  return /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(ip)
}

function isIPv6(ip: string): boolean {
  return ip.includes(':')
}

// --- Range loading ---

async function fetchAndParseRanges(): Promise<void> {
  try {
    const res = await fetch(RANGES_URL, { cache: 'no-store' })
    const data = await res.json()

    const newIPv4Ranges: IPv4Range[] = []
    const newIPv6Ranges: IPv6Range[] = []

    for (const prefix of data.prefixes || []) {
      if (prefix.ipv4Prefix) {
        const r = parseIPv4Cidr(prefix.ipv4Prefix)
        if (r) newIPv4Ranges.push(r)
      }
      if (prefix.ipv6Prefix) {
        const r = parseIPv6Cidr(prefix.ipv6Prefix)
        if (r) newIPv6Ranges.push(r)
      }
    }

    ipv4Ranges = newIPv4Ranges
    ipv6Ranges = newIPv6Ranges
    rangesExpires = Date.now() + RANGES_TTL_MS

    console.log(
      `[Googlebot Ranges] Loaded ${ipv4Ranges.length} IPv4 and ${ipv6Ranges.length} IPv6 prefixes`
    )
  } catch (err) {
    console.error('[Googlebot Ranges] Failed to load:', err)
    // Keep existing ranges if fetch fails
  }
}

// Pre-fetch ranges at module load (runs once on cold start)
function ensureRangesLoaded(): Promise<void> {
  const now = Date.now()

  // If ranges are fresh, return immediately
  if (now < rangesExpires && (ipv4Ranges.length > 0 || ipv6Ranges.length > 0)) {
    return Promise.resolve()
  }

  // If already loading, return existing promise
  if (initialLoadPromise) {
    return initialLoadPromise
  }

  // Start loading
  initialLoadPromise = fetchAndParseRanges().finally(() => {
    initialLoadPromise = null
  })

  return initialLoadPromise
}

// Trigger pre-fetch immediately at module initialization
ensureRangesLoaded()

// Schedule background refresh
setInterval(() => {
  ensureRangesLoaded()
}, RANGES_TTL_MS)

// --- Public API ---

/**
 * Synchronous check if IP is in Googlebot ranges.
 * Returns false if ranges haven't loaded yet (fail-closed).
 */
export function isGooglebotIpByRangeSync(ip: string): boolean {
  if (isIPv4(ip)) {
    const ipInt = ipv4ToInt(ip)
    if (ipInt == null) return false
    return ipv4Ranges.some((r) => ipv4InRange(ipInt, r))
  }

  if (isIPv6(ip)) {
    const ipBigInt = ipv6ToBigInt(ip)
    if (ipBigInt == null) return false
    return ipv6Ranges.some((r) => ipv6InRange(ipBigInt, r))
  }

  return false
}

/**
 * Async check that ensures ranges are loaded first.
 * Use this if you need guaranteed ranges (e.g., first request after cold start).
 */
export async function isGooglebotIpByRange(ip: string): Promise<boolean> {
  await ensureRangesLoaded()
  return isGooglebotIpByRangeSync(ip)
}
