"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { Award, BookOpen, FileText, Languages, Moon, Play, Radar, Route, Sparkles, StickyNote } from "lucide-react";
import { Command, CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from "@/components/ui/command";
import { useI18n } from "@/lib/i18n/client";
import { setLocale } from "@/lib/i18n/actions";
import { api } from "@/lib/api";

type SearchResult = { type: "course" | "lesson" | "path" | "note"; id: string; title: string; subtitle?: string; href: string };

export function CommandPalette({ open, onOpenChange, onAskAi }: { open: boolean; onOpenChange: (o: boolean) => void; onAskAi: () => void }) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const { resolvedTheme, setTheme } = useTheme();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) { setQuery(""); setResults([]); return; }
  }, [open]);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) { setResults([]); return; }
    setLoading(true);
    const id = setTimeout(() => {
      api<{ results: SearchResult[] }>(`/api/search?q=${encodeURIComponent(q)}`).then((r) => setResults(r.results)).catch(() => setResults([])).finally(() => setLoading(false));
    }, 180);
    return () => clearTimeout(id);
  }, [query]);

  const go = (href: string) => { onOpenChange(false); router.push(href); };
  const grouped = useMemo(() => ({
    course: results.filter((r) => r.type === "course"),
    lesson: results.filter((r) => r.type === "lesson"),
    path: results.filter((r) => r.type === "path"),
    note: results.filter((r) => r.type === "note"),
  }), [results]);
  const icon = { course: BookOpen, lesson: FileText, path: Route, note: StickyNote };

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange} title={t("nav.openCommandPalette")} description={t("common.palette.hint")} className="glass-3">
      <Command shouldFilter={false}>
        <CommandInput placeholder={t("common.palette.placeholder")} value={query} onValueChange={setQuery} />
        <CommandList>
          <CommandEmpty>{loading ? t("common.status.loading") : t("common.palette.noResults")}</CommandEmpty>
          {(["course", "lesson", "path", "note"] as const).map((type) =>
            grouped[type].length ? (
              <CommandGroup key={type} heading={t(`common.palette.groups.${type === "course" ? "courses" : type === "lesson" ? "lessons" : type === "path" ? "paths" : "notes"}`)}>
                {grouped[type].map((r) => {
                  const I = icon[r.type];
                  return (
                    <CommandItem key={r.id} value={`${r.type}-${r.id}`} onSelect={() => go(r.href)}>
                      <I className="size-4" />
                      <span className="truncate">{r.title}</span>
                      {r.subtitle && <span className="ms-auto truncate text-xs text-muted-foreground">{r.subtitle}</span>}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            ) : null,
          )}
          {results.length > 0 && <CommandSeparator />}
          <CommandGroup heading={t("common.palette.groups.actions")}>
            <CommandItem value="continue" onSelect={() => go("/learn")}><Play className="size-4" /> {t("common.palette.commands.continue")}</CommandItem>
            <CommandItem value="ask-ai" onSelect={onAskAi}><Sparkles className="size-4" /> {t("common.palette.commands.askAi")}{query.trim() ? `: “${query.trim()}”` : ""}</CommandItem>
            <CommandItem value="notes" onSelect={() => go("/notes")}><StickyNote className="size-4" /> {t("common.palette.commands.notes")}</CommandItem>
            <CommandItem value="skills" onSelect={() => go("/skills")}><Radar className="size-4" /> {t("common.palette.commands.skills")}</CommandItem>
            <CommandItem value="certificates" onSelect={() => go("/certificates")}><Award className="size-4" /> {t("common.palette.commands.certificates")}</CommandItem>
            <CommandItem value="theme" onSelect={() => { setTheme(resolvedTheme === "dark" ? "light" : "dark"); onOpenChange(false); }}><Moon className="size-4" /> {t("common.palette.commands.theme")}</CommandItem>
            <CommandItem value="language" onSelect={async () => { await setLocale(locale === "ar" ? "en" : "ar"); onOpenChange(false); router.refresh(); }}><Languages className="size-4" /> {t("common.palette.commands.language")}</CommandItem>
          </CommandGroup>
        </CommandList>
      </Command>
    </CommandDialog>
  );
}
