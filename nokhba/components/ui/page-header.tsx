import { cn } from "@/lib/utils";
import { Eyebrow } from "./glass";

/** Standard page header for platform pages: eyebrow, title, description, optional actions on the end side. */
export function PageHeader({ eyebrow, title, description, actions, className }: { eyebrow?: React.ReactNode; title: React.ReactNode; description?: React.ReactNode; actions?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between", className)}>
      <div className="min-w-0 space-y-1.5">
        {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
        <h1 className="font-heading text-title">{title}</h1>
        {description ? <p className="max-w-2xl text-sm text-muted-foreground sm:text-base">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function PageContainer({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("container-app flex flex-col gap-8 py-6 sm:py-8", className)} {...props} />;
}
