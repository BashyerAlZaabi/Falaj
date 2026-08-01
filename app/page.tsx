import { redirect } from "next/navigation";

/** «اليوم» هي الصفحة الرئيسية (PROMPT §6). */
export default function Root() {
  redirect("/today");
}
