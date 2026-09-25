// Shared UI state + event bus. Workspace context (selected project, open
// document, selected widget, last upload) is sent with every chat request so
// the assistant can resolve "this project" / "the open document".
export const state = {
  me: null,
  route: 'home', params: [],
  selectedProjectId: null, selectedWidgetId: null, selectedTaskId: null,
  openDocumentId: null, lastUploadId: null, lastUploadName: null,
  conversationId: (() => { try { return localStorage.getItem('swp.conv') || null; } catch { return null; } })(),
  arranging: false,
};
export const bus = new EventTarget();
export const on = (type, fn) => bus.addEventListener(type, (e) => fn(e.detail));
export const emit = (type, detail) => bus.dispatchEvent(new CustomEvent(type, { detail }));

export function setConversation(id) {
  state.conversationId = id;
  try { id ? localStorage.setItem('swp.conv', id) : localStorage.removeItem('swp.conv'); } catch {}
}
export function uiContext() {
  return { view: state.route, selectedProjectId: state.selectedProjectId, selectedWidgetId: state.selectedWidgetId, selectedTaskId: state.selectedTaskId, openDocumentId: state.openDocumentId, lastUploadId: state.lastUploadId };
}
