import { NextResponse, type NextRequest } from 'next/server';

/**
 * Cheap first gate: protected areas need *a* session cookie, otherwise we redirect to sign-in without rendering.
 * This is a convenience, not security: the API verifies the token and enforces roles on every request.
 */
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isRecruiterPortal = pathname.startsWith('/recruiter') && !pathname.startsWith('/recruiter/login');
  const cookie = isRecruiterPortal ? 'prp_recruiter_session' : 'prp_session';
  if (!req.cookies.get(cookie)) {
    const url = req.nextUrl.clone();
    url.pathname = isRecruiterPortal ? '/recruiter/login' : '/login';
    url.search = isRecruiterPortal ? '' : `?next=${encodeURIComponent(pathname)}`;
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = { matcher: ['/student/:path*', '/faculty/:path*', '/officer/:path*', '/head/:path*', '/admin/:path*', '/recruiter/((?!login).*)', '/recruiter'] };
