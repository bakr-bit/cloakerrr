// utils/googlebotRanges.ts
// Fast Googlebot verification using Google's official IP range JSON

const RANGES_TTL_MS = 10 * 60 * 1000 // 10 minutes

type IPv4Range = { network: number; mask: number }

let ipv4Ranges: IPv4Range[] = []
let rangesExpires = 0

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split('.')
  if (parts.length !== 4) return null
  const nums = parts.map((p) => Number(p))
  if (nums.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null
  return ((nums[0] << 24) | (nums[1] << 16) | (nums[2] << 8) | nums[3]) >>> 0
}

function parseCidr(cidr: string): IPv4Range | null {
  const [ip, bitsStr] = cidr.split('/')
  const bits = Number(bitsStr)
  if (!ip || !Number.isInteger(bits) || bits < 0 || bits > 32) return null
  const ipInt = ipv4ToInt(ip)
  if (ipInt == null) return null
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0
  const network = ipInt & mask
  return { network, mask }
}

function contains(ipInt: number, range: IPv4Range): boolean {
  return (ipInt & range.mask) === range.network
}

async function loadGooglebotRanges(): Promise<void> {
  const now = Date.now()
  if (now < rangesExpires && ipv4Ranges.length > 0) return

  try {
    const res = await fetch(
      'https://developers.google.com/static/search/apis/ipranges/googlebot.json',
      { cache: 'no-store' }
    )
    const data = await res.json()

    const newRanges: IPv4Range[] = []

    for (const prefix of data.prefixes || []) {
      if (prefix.ipv4Prefix) {
        const r = parseCidr(prefix.ipv4Prefix)
        if (r) newRanges.push(r)
      }
      // IPv6 support could be added here
    }

    ipv4Ranges = newRanges
    rangesExpires = Date.now() + RANGES_TTL_MS
  } catch (err) {
    console.error('Failed to load Googlebot ranges:', err)
    // Keep existing ranges if fetch fails
  }
}

export async function isGooglebotIpByRange(ip: string): Promise<boolean> {
  const ipInt = ipv4ToInt(ip)
  if (ipInt == null) return false

  await loadGooglebotRanges()

  return ipv4Ranges.some((r) => contains(ipInt, r))
}
