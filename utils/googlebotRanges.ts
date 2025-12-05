// utils/googlebotRanges.ts
// Fast Googlebot verification using pre-fetched IP ranges (build-time)
// CIDR RANGE CHECK (Fast Path ~0ms, no network I/O)

import { IPV4_PREFIXES, IPV6_PREFIXES } from './googlebot-ranges.generated'

// IPv4 range: network + mask as 32-bit unsigned integers
type IPv4Range = { network: number; mask: number }

// IPv6 range: network + prefixLen as BigInt (128-bit)
type IPv6Range = { network: bigint; prefixLen: number }

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

// --- Parse prefixes at module load (static, no network I/O) ---

const ipv4Ranges: IPv4Range[] = IPV4_PREFIXES.map(parseIPv4Cidr).filter(
  (r): r is IPv4Range => r !== null
)

const ipv6Ranges: IPv6Range[] = IPV6_PREFIXES.map(parseIPv6Cidr).filter(
  (r): r is IPv6Range => r !== null
)

console.log(
  `[Googlebot Ranges] Loaded ${ipv4Ranges.length} IPv4 and ${ipv6Ranges.length} IPv6 prefixes (build-time)`
)

// --- Public API ---

/**
 * Synchronous check if IP is in Googlebot ranges.
 * Fully in-memory, no network I/O - ranges are embedded at build time.
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
 * Async wrapper for compatibility. No actual async work - returns immediately.
 */
export async function isGooglebotIpByRange(ip: string): Promise<boolean> {
  return isGooglebotIpByRangeSync(ip)
}
