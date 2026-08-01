import { PageTitle } from "@/components/page-title";
import { EmptyState } from "@/components/ui/empty-state";
import { GrainSurface } from "@/components/signature/grain-surface";

/** المساعد — تكتمل المحادثة وأدواتها في المرحلة ٣ عبر /api/agent. */
export default function AssistantPage() {
  return (
    <div>
      <PageTitle>المساعد</PageTitle>
      <p className="subtle mt-1 text-sm">
        اسألني عن مزرعتك وأنفّذ لك مباشرة
      </p>

      <GrainSurface className="mt-5 rounded-lg p-6">
        <p className="font-head text-sm text-brass-l">قريباً</p>
        <p className="mt-1 text-sm text-nacre/80">
          المحادثة الذكية تُفعَّل في المرحلة الثالثة — أضف قطعة، سجّل حصاداً،
          أو اسأل عن الجهات، وكل شي ينفَّذ من هنا.
        </p>
      </GrainSurface>

      <section className="mt-4">
        <EmptyState title="لا محادثات بعد" />
      </section>
    </div>
  );
}
