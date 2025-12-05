import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { isGooglebotIpByRange } from './utils/googlebotRanges'
import { isVerifiedGoogleBot } from './utils/verifyGooglebot'

function getClientIp(request: NextRequest): string {
  // Cloudflare: real client IP
  const cfIp = request.headers.get('cf-connecting-ip')
  if (cfIp) return cfIp.trim()

  // Prefer platform-provided IP when available (Vercel, etc.)
  // Note: request.ip is Vercel-specific, not in standard NextRequest type
  const platformIp = (request as unknown as { ip?: string }).ip
  if (platformIp) return platformIp

  const realIp = request.headers.get('x-real-ip')
  if (realIp) return realIp.trim()

  const xff = request.headers.get('x-forwarded-for')
  if (xff) {
    const first = xff.split(',')[0]
    if (first) return first.trim()
  }

  // Dev / fallback
  return '127.0.0.1'
}

export async function middleware(request: NextRequest) {
  const userAgent = request.headers.get('user-agent') || ''

  // Check for Googlebot and other Google crawlers/tools
  const isGoogleUA =
    userAgent.includes('Googlebot') ||
    userAgent.includes('Google-InspectionTool') ||
    userAgent.includes('Storebot-Google') ||
    userAgent.includes('GoogleOther')

  if (isGoogleUA) {
    const ip = getClientIp(request)

    console.log('[Googlebot Check] UA:', userAgent.substring(0, 50))
    console.log('[Googlebot Check] IP:', ip)

    // CIDR RANGE CHECK (Fast Path ~0ms, no network I/O)
    let isValid = await isGooglebotIpByRange(ip)
    console.log('[Googlebot Check] CIDR RANGE CHECK (Fast Path ~0ms, no network I/O):', isValid)

    // Fallback: DNS verification (covers testing tools like Rich Results Test)
    if (!isValid) {
      isValid = await isVerifiedGoogleBot(ip)
      console.log('[Googlebot Check] DNS result:', isValid)
    }

    if (isValid) {
      console.log('[Googlebot Check] Serving "Hi Google"')
      return new NextResponse('Hi Google', {
        status: 200,
        headers: { 'Content-Type': 'text/html' },
      })
    } else {
      console.log('[Googlebot Check] REJECTED - serving user page')
    }
  }

  // Serve user.html for regular visitors
  return NextResponse.rewrite(new URL('/user.html', request.url))
}

export const config = {
  matcher: '/',
}
