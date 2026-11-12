import { MessageModal } from "./MessageModal.tsx";
import { renderRoot } from "./renderRoot.tsx";
import { getHtmlElement } from "./utils.ts";

export function mountMessageModal(): void {
  renderRoot(getHtmlElement("#message-modal"), <MessageModal />);
}
