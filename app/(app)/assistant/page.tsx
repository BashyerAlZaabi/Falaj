import { PageTitle } from "@/components/page-title";
import { Chat } from "@/components/assistant/chat";

/** المساعد — محادثة بأدوات تنفيذ محلية عبر وسيط /api/agent (المرحلة ٣). */
export default function AssistantPage() {
  return (
    <div>
      <PageTitle>المساعد</PageTitle>
      <p className="subtle mt-1 text-sm">اسألني عن مزرعتك وأنفّذ لك مباشرة</p>
      <div className="mt-4">
        <Chat />
      </div>
    </div>
  );
}
