// Awards — PLACEHOLDER view (replaced when the system is built).
import { sysHeader, placeholder } from '../../sys-kit.js';

export async function render(root, ctx) {
  root.append(sysHeader(ctx), placeholder(ctx));
}
