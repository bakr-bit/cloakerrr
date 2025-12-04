import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { isVerifiedGoogleBot } from './utils/verifyGooglebot'

// Simple in-memory cache for verified IPs
const ipCache = new Map<string, boolean>()

export async function middleware(request: NextRequest) {
  // 1. GEO CHECK - Skip everything for Swedish visitors
  const country = request.geo?.country || request.headers.get('x-vercel-ip-country') || ''
  if (country === 'SE') {
    return NextResponse.next()
  }

  // 2. Only check if it CLAIMS to be Googlebot (non-Swedish traffic)
  const userAgent = request.headers.get('user-agent') || ''
  if (userAgent.includes('Googlebot')) {
    const ip = request.ip || request.headers.get('x-forwarded-for')?.split(',')[0] || '127.0.0.1'

    // Check Cache First
    if (ipCache.has(ip)) {
      const isGoodBot = ipCache.get(ip)
      if (isGoodBot) {
        return NextResponse.rewrite(new URL('/googlebot', request.url))
      }
      // Cached as false - don't serve bot page
      return NextResponse.next()
    }

    // 2. Perform DoH Check
    const isValid = await isVerifiedGoogleBot(ip)

    // 3. Save to Cache
    ipCache.set(ip, isValid)

    if (isValid) {
      return NextResponse.rewrite(new URL('/googlebot', request.url))
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: '/',
}
