#!/usr/bin/env node
// Quick test to verify CIDR range checking works

import { IPV4_PREFIXES, IPV6_PREFIXES } from '../utils/googlebot-ranges.generated.ts'

// --- IPv4 helpers (copied from googlebotRanges.ts) ---
function ipv4ToInt(ip) {
  const parts = ip.split('.')
  if (parts.length !== 4) return null
  const nums = parts.map((p) => Number(p))
  if (nums.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null
  return ((nums[0] << 24) | (nums[1] << 16) | (nums[2] << 8) | nums[3]) >>> 0
}

function parseIPv4Cidr(cidr) {
  const [ip, bitsStr] = cidr.split('/')
  const bits = Number(bitsStr)
  if (!ip || !Number.isInteger(bits) || bits < 0 || bits > 32) return null
  const ipInt = ipv4ToInt(ip)
  if (ipInt == null) return null
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0
  const network = ipInt & mask
  return { network, mask }
}

function ipv4InRange(ipInt, range) {
  return (ipInt & range.mask) === range.network
}

// Parse all ranges
const ipv4Ranges = IPV4_PREFIXES.map(parseIPv4Cidr).filter(r => r !== null)

function isGooglebotIp(ip) {
  const ipInt = ipv4ToInt(ip)
  if (ipInt == null) return false
  return ipv4Ranges.some(r => ipv4InRange(ipInt, r))
}

// --- Tests ---
console.log('=== Googlebot IP Range Test ===\n')
console.log(`Loaded ${ipv4Ranges.length} IPv4 ranges, ${IPV6_PREFIXES.length} IPv6 prefixes\n`)

// Known Googlebot IPs (from Google's documentation examples)
const knownGooglebotIPs = [
  '66.249.66.1',
  '66.249.66.200',
  '66.249.64.0',
  '66.249.79.255',
]

// Non-Googlebot IPs
const nonGooglebotIPs = [
  '8.8.8.8',        // Google DNS (not Googlebot)
  '1.1.1.1',        // Cloudflare
  '192.168.1.1',    // Private
  '203.0.113.50',   // TEST-NET
]

console.log('Testing known Googlebot IPs (should be TRUE):')
for (const ip of knownGooglebotIPs) {
  const result = isGooglebotIp(ip)
  console.log(`  ${ip}: ${result ? '✅ PASS' : '❌ FAIL'}`)
}

console.log('\nTesting non-Googlebot IPs (should be FALSE):')
for (const ip of nonGooglebotIPs) {
  const result = isGooglebotIp(ip)
  console.log(`  ${ip}: ${!result ? '✅ PASS' : '❌ FAIL (detected as Googlebot!)'}`)
}

// Show first few prefixes for verification
console.log('\nFirst 5 IPv4 prefixes in the list:')
IPV4_PREFIXES.slice(0, 5).forEach(p => console.log(`  ${p}`))
