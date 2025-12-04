import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { isGooglebotIpByRange } from './utils/googlebotRanges'
import { isVerifiedGoogleBot } from './utils/verifyGooglebot'

export async function middleware(request: NextRequest) {
  const userAgent = request.headers.get('user-agent') || ''

  // Only check if it CLAIMS to be Googlebot
  if (userAgent.includes('Googlebot')) {
    const ip =
      request.headers.get('x-real-ip') ||
      request.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
      '127.0.0.1'

    console.log('[Googlebot Check] UA:', userAgent.substring(0, 50))
    console.log('[Googlebot Check] IP:', ip)

    // Fast path: CIDR range check (covers actual Googlebot crawler)
    let isValid = await isGooglebotIpByRange(ip)
    console.log('[Googlebot Check] CIDR result:', isValid)

    // Fallback: DNS verification (covers testing tools like Rich Results Test)
    if (!isValid) {
      isValid = await isVerifiedGoogleBot(ip)
      console.log('[Googlebot Check] DNS result:', isValid)
    }

    if (isValid) {
      return NextResponse.rewrite(new URL('/googlebot', request.url))
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: '/',
}
