import "server-only";

export function jsonError(message: string, status: number): Response {
  return Response.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
}

export function json(data: unknown, status = 200): Response {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

export const MSG = {
  badRequest: "ข้อมูลไม่ถูกต้อง ลองใหม่อีกครั้ง",
  tooMany: "ใช้งานถี่เกินไป รอสักครู่แล้วลองใหม่",
  server: "ระบบขัดข้องชั่วคราว ลองใหม่อีกครั้งในอีกสักครู่",
  notFound: "ไม่พบไฟล์นี้ อาจหมดอายุหรือถูกลบไปแล้ว",
} as const;

export async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return null;
  }
}

/** Wraps a handler so unexpected errors become a friendly 500 and get logged. */
export function handle<Args extends unknown[]>(fn: (...args: Args) => Promise<Response>) {
  return async (...args: Args): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (err) {
      console.error(err);
      return jsonError(MSG.server, 500);
    }
  };
}
