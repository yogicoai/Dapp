/** 확장자 없는 상대 import 를 .ts 로 풀어 준다 (Next 번들러가 하던 일). */
export async function resolve(spec, ctx, next) {
  if ((spec.startsWith("./") || spec.startsWith("../")) && !/\.[a-z]+$/i.test(spec)) {
    for (const ext of [".ts", ".tsx", "/index.ts"]) {
      try { return await next(spec + ext, ctx); } catch {}
    }
  }
  return next(spec, ctx);
}
