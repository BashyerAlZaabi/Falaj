import { cn } from "@/lib/utils";
import { Glass } from "./glass";

export function EmptyState({ icon, title, description, action, className }: { icon?: React.ReactNode; title: React.ReactNode; description?: React.ReactNode; action?: React.ReactNode; className?: string }) {
  return (
    <Glass level={2} className={cn("flex flex-col items-center gap-3 px-6 py-12 text-center", className)}>
      {icon ? <div className="grid size-12 place-items-center rounded-2xl bg-primary/10 text-primary [&_svg]:size-6">{icon}</div> : null}
      <p className="font-heading text-lg font-semibold">{title}</p>
      {description ? <p className="max-w-md text-sm text-muted-foreground">{description}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </Glass>
  );
}

export function ErrorState({ title, description, action, className }: { title: React.ReactNode; description?: React.ReactNode; action?: React.ReactNode; className?: string }) {
  return (
    <Glass level={2} className={cn("flex flex-col items-center gap-3 border-destructive/30 px-6 py-10 text-center", className)}>
      <p className="font-heading text-lg font-semibold text-destructive">{title}</p>
      {description ? <p className="max-w-md text-sm text-muted-foreground">{description}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </Glass>
  );
}
