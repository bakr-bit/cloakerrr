import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { isGooglebotIpByRange } from './utils/googlebotRanges'
// import { isVerifiedGoogleBot } from './utils/verifyGooglebot' // Optional: for strict DNS check

export async function middleware(request: NextRequest) {
  const userAgent = request.headers.get('user-agent') || ''

  // Only check if it CLAIMS to be Googlebot
  if (userAgent.includes('Googlebot')) {
    const ip =
      request.ip ||
      request.headers.get('x-real-ip') ||
      request.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
      '127.0.0.1'

    // Fast path: CIDR range check (no DNS, just integer math)
    const isGooglebotIp = await isGooglebotIpByRange(ip)

    if (isGooglebotIp) {
      // Optional: Add strict DNS double-check for high-value endpoints
      // const strictVerified = await isVerifiedGoogleBot(ip)
      // if (!strictVerified) return NextResponse.next()

      return NextResponse.rewrite(new URL('/googlebot', request.url))
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: '/',
}
