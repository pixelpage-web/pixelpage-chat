import { cookies } from "next/headers";
import { LANG_COOKIE, type Lang } from "./index";

/** Idioma atual lido do cookie (Server Components / layouts). */
export async function getLang(): Promise<Lang> {
  const store = await cookies();
  return store.get(LANG_COOKIE)?.value === "en" ? "en" : "pt";
}
