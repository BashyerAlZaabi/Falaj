/* Microsoft Graph backend (Outlook mail & calendar, SharePoint / OneDrive files).
   Auth, in order of preference:
     1. App-only (production): M365_TENANT_ID + M365_CLIENT_ID + M365_CLIENT_SECRET + M365_MAILBOX
        Application permissions: Mail.ReadWrite, Calendars.ReadWrite, Files.ReadWrite.All (or Sites.Selected).
        Restrict mailbox access with an Exchange Application Access Policy / RBAC for Applications.
     2. Delegated token for quick tests: M365_ACCESS_TOKEN (e.g. from Graph Explorer; expires in ~1h).
   Files: M365_SHAREPOINT_SITE="contoso.sharepoint.com:/sites/Audit" uses that site's document
   library; otherwise the mailbox user's OneDrive. */
import { htmlToText } from './extract.js';

const GRAPH = process.env.M365_GRAPH_URL || 'https://graph.microsoft.com/v1.0';
const TZ = process.env.M365_TIMEZONE || 'Arabian Standard Time';

export function graphConfigured() {
  const e = process.env;
  return !!(e.M365_ACCESS_TOKEN || (e.M365_TENANT_ID && e.M365_CLIENT_ID && e.M365_CLIENT_SECRET && e.M365_MAILBOX));
}

const q = (s) => String(s).replace(/"/g, '\\"');
const encPath = (p) => String(p).split('/').filter(Boolean).map(encodeURIComponent).join('/');

export class GraphBackend {
  constructor(env = process.env) {
    this.env = env;
    this.appOnly = !env.M365_ACCESS_TOKEN;
    this.user = this.appOnly ? `/users/${encodeURIComponent(env.M365_MAILBOX)}` : '/me';
    this.token = null;
    this.mode = this.appOnly ? `Microsoft 365 (app-only, mailbox ${env.M365_MAILBOX})` : 'Microsoft 365 (delegated token)';
  }

  async auth() {
    if (!this.appOnly) return this.env.M365_ACCESS_TOKEN;
    if (this.token && this.token.exp > Date.now() + 60_000) return this.token.value;
    const res = await fetch(this.env.M365_TOKEN_URL || `https://login.microsoftonline.com/${this.env.M365_TENANT_ID}/oauth2/v2.0/token`, {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'client_credentials', client_id: this.env.M365_CLIENT_ID, client_secret: this.env.M365_CLIENT_SECRET, scope: 'https://graph.microsoft.com/.default' }),
    });
    const body = await res.json();
    if (!res.ok) throw new Error(`Microsoft sign-in failed: ${body.error_description || body.error || res.status}`);
    this.token = { value: body.access_token, exp: Date.now() + body.expires_in * 1000 };
    return this.token.value;
  }

  async req(method, url, { body, headers = {}, raw } = {}) {
    const res = await fetch(url.startsWith('http') ? url : GRAPH + url, {
      method,
      headers: { Authorization: `Bearer ${await this.auth()}`, Prefer: `outlook.timezone="${TZ}"`, ...(body && !raw ? { 'Content-Type': 'application/json' } : {}), ...headers },
      body: body === undefined ? undefined : raw ? body : JSON.stringify(body),
    });
    if (raw === 'download') {
      if (!res.ok) throw new Error(`Graph HTTP ${res.status}`);
      return Buffer.from(await res.arrayBuffer());
    }
    const text = await res.text();
    const data = text ? JSON.parse(text) : {};
    if (!res.ok) throw new Error(`Graph HTTP ${res.status}: ${data.error?.message || text.slice(0, 200)}`);
    return data;
  }

  async drive() {
    if (this.driveBase) return this.driveBase;
    const site = this.env.M365_SHAREPOINT_SITE;
    if (site) {
      const s = await this.req('GET', `/sites/${site}`);
      this.driveBase = `/sites/${s.id}/drive`;
    } else this.driveBase = `${this.user}/drive`;
    return this.driveBase;
  }

  // ---------- mail ----------
  async searchEmails({ query, from, since, top }) {
    const kql = [query, from && `from:${from}`, since && `received>=${since}`].filter(Boolean).join(' ');
    const sel = '$select=id,subject,from,receivedDateTime,bodyPreview,hasAttachments,webLink';
    const url = kql
      ? `${this.user}/messages?$search="${encodeURIComponent(q(kql))}"&$top=${top}&${sel}`
      : `${this.user}/messages?$top=${top}&$orderby=receivedDateTime desc&${sel}`;
    const r = await this.req('GET', url);
    return r.value.map((m) => ({ id: m.id, subject: m.subject, from: m.from?.emailAddress?.address, fromName: m.from?.emailAddress?.name, received: m.receivedDateTime, preview: m.bodyPreview, hasAttachments: m.hasAttachments, webLink: m.webLink }));
  }

  async readEmail(id) {
    const m = await this.req('GET', `${this.user}/messages/${encodeURIComponent(id)}?$select=id,subject,from,toRecipients,ccRecipients,receivedDateTime,body,hasAttachments,webLink`);
    const atts = m.hasAttachments ? (await this.req('GET', `${this.user}/messages/${encodeURIComponent(id)}/attachments?$select=id,name,contentType,size`)).value : [];
    return {
      id: m.id, subject: m.subject, from: m.from?.emailAddress?.address, to: (m.toRecipients || []).map((r) => r.emailAddress.address),
      cc: (m.ccRecipients || []).map((r) => r.emailAddress.address), received: m.receivedDateTime, webLink: m.webLink,
      body: m.body?.contentType === 'html' ? htmlToText(m.body.content) : m.body?.content,
      attachments: atts.map((a) => ({ id: a.id, name: a.name, contentType: a.contentType, size: a.size })),
    };
  }

  async getAttachment(messageId, attachmentId) {
    const a = await this.req('GET', `${this.user}/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(attachmentId)}`);
    if (!a.contentBytes) throw new Error('Only file attachments can be read (not item or link attachments).');
    return { name: a.name, contentType: a.contentType, buffer: Buffer.from(a.contentBytes, 'base64') };
  }

  async draftEmail({ to, cc, subject, body, replyTo }) {
    const recipients = (list) => (list || []).map((address) => ({ emailAddress: { address } }));
    let draft;
    if (replyTo) {
      draft = await this.req('POST', `${this.user}/messages/${encodeURIComponent(replyTo)}/createReply`, { body: {} });
      draft = await this.req('PATCH', `${this.user}/messages/${draft.id}`, { body: {
        body: { contentType: 'Text', content: body }, ...(to?.length ? { toRecipients: recipients(to) } : {}), ...(cc?.length ? { ccRecipients: recipients(cc) } : {}) } });
    } else {
      draft = await this.req('POST', `${this.user}/messages`, { body: { subject, body: { contentType: 'Text', content: body }, toRecipients: recipients(to), ccRecipients: recipients(cc) } });
    }
    return { id: draft.id, status: 'draft saved in Outlook Drafts — not sent', subject: draft.subject, webLink: draft.webLink };
  }

  // ---------- calendar ----------
  async listEvents({ from, to }) {
    const r = await this.req('GET', `${this.user}/calendarView?startDateTime=${from}T00:00:00&endDateTime=${to}T23:59:59&$orderby=start/dateTime&$top=100&$select=id,subject,start,end,location,attendees,organizer,isOnlineMeeting,webLink`);
    return r.value.map((e) => ({ id: e.id, subject: e.subject, start: e.start.dateTime, end: e.end.dateTime, timeZone: e.start.timeZone, location: e.location?.displayName, organizer: e.organizer?.emailAddress?.address, attendees: (e.attendees || []).map((a) => a.emailAddress.address), online: e.isOnlineMeeting, webLink: e.webLink }));
  }

  async createEvent({ subject, start, end, attendees, location, body, online }) {
    const e = await this.req('POST', `${this.user}/events`, { body: {
      subject, start: { dateTime: start, timeZone: TZ }, end: { dateTime: end, timeZone: TZ },
      attendees: (attendees || []).map((address) => ({ emailAddress: { address }, type: 'required' })),
      ...(location ? { location: { displayName: location } } : {}), ...(body ? { body: { contentType: 'Text', content: body } } : {}),
      ...(online ? { isOnlineMeeting: true, onlineMeetingProvider: 'teamsForBusiness' } : {}) } });
    return { id: e.id, subject: e.subject, start: e.start.dateTime, end: e.end.dateTime, invitationsSentTo: (attendees || []), webLink: e.webLink };
  }

  // ---------- files ----------
  item(i) { return { id: i.id, name: i.name, folder: !!i.folder, size: i.size, modified: i.lastModifiedDateTime, modifiedBy: i.lastModifiedBy?.user?.displayName, path: i.parentReference?.path?.replace(/^.*root:/, '') || '', webUrl: i.webUrl }; }

  async searchFiles({ query, top }) {
    const d = await this.drive();
    const r = await this.req('GET', `${d}/root/search(q='${encodeURIComponent(query.replace(/'/g, "''"))}')?$top=${top}`);
    return r.value.map((i) => this.item(i));
  }

  async listFolder(path) {
    const d = await this.drive();
    const r = await this.req('GET', path && path !== '/' ? `${d}/root:/${encPath(path)}:/children?$top=200` : `${d}/root/children?$top=200`);
    return r.value.map((i) => this.item(i));
  }

  async downloadFile({ path, id }) {
    const d = await this.drive();
    const meta = await this.req('GET', id ? `${d}/items/${encodeURIComponent(id)}` : `${d}/root:/${encPath(path)}`);
    if (meta.folder) throw new Error('That is a folder — use list_folder.');
    if (meta.size > 25 * 1024 * 1024) throw new Error('File is larger than 25 MB.');
    const buffer = await this.req('GET', `${d}/items/${meta.id}/content`, { raw: 'download' });
    return { ...this.item(meta), buffer };
  }

  async saveFile({ folder, name, content }) {
    const d = await this.drive();
    const target = [folder, name].filter(Boolean).join('/');
    const i = await this.req('PUT', `${d}/root:/${encPath(target)}:/content?@microsoft.graph.conflictBehavior=rename`, { body: Buffer.from(content, 'utf8'), raw: true, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    return this.item(i);
  }
}
