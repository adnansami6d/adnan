import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Pages that need a logged-in user
const LOGIN_REQUIRED = ["/account", "/wallet", "/verify-phone"];

export async function middleware(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return NextResponse.next({ request }); // env vars missing: do not crash the site

  let response = NextResponse.next({ request });

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        );
      },
    },
  });

  // getUser() asks Supabase to verify the token (getSession() only reads the cookie and can be faked)
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isAdminArea = pathname === "/admin" || pathname.startsWith("/admin/");
  const isWalletApi = pathname.startsWith("/api/wallet");
  const needsLogin =
    LOGIN_REQUIRED.some((p) => pathname === p || pathname.startsWith(p + "/")) || isAdminArea;

  // keep refreshed auth cookies when we redirect
  const redirect = (to: string) => {
    const res = NextResponse.redirect(new URL(to, request.url));
    response.cookies.getAll().forEach((c) => res.cookies.set(c));
    return res;
  };

  // wallet APIs: JSON 401 instead of a redirect
  if (isWalletApi && !user) {
    return NextResponse.json({ error: "LOGIN_REQUIRED" }, { status: 401 });
  }

  if (needsLogin && !user) {
    const login = new URL("/login", request.url);
    login.searchParams.set("next", pathname + request.nextUrl.search);
    return redirect(login.pathname + login.search);
  }

  // admin pages: role lives in app_metadata (can only be set from the server / dashboard)
  // This is a convenience check. The real protection is RLS + is_admin() inside the database functions.
  if (isAdminArea && user?.app_metadata?.role !== "admin") {
    return redirect("/");
  }

  // already logged in: no need to see login/register again
  if (user && (pathname === "/login" || pathname === "/register")) {
    return redirect("/account");
  }

  return response;
}

export const config = {
  matcher: [
    // run on everything except static files and images
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|map)$).*)",
  ],
};
