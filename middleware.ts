import { NextResponse, type NextRequest } from "next/server";
import { checkAccess } from "@/lib/gate";

// Every page and server action goes through here (see lib/gate.ts).
export function middleware(req: NextRequest) {
  const result = checkAccess({
    authorization: req.headers.get("authorization"),
    password: process.env.APP_PASSWORD,
    production: process.env.NODE_ENV === "production",
  });
  if (result === "allow") return NextResponse.next();
  if (result === "unconfigured") {
    return new NextResponse("Set APP_PASSWORD in your environment variables, then redeploy. This app holds a Workspace369 token, so it stays closed until it has a password.", {
      status: 503,
      headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
    });
  }
  return new NextResponse("Password required.", {
    status: 401,
    headers: { "www-authenticate": 'Basic realm="CRM", charset="UTF-8"', "cache-control": "no-store" },
  });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
