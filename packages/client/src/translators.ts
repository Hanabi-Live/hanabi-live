// Page translators, such as the one in Chrome, replace the text nodes of the page with translated
// ones. React still holds the old nodes, so it fails when it removes one or inserts a node before
// one: "Failed to execute 'removeChild' on 'Node'". The error removes the whole React tree, which
// leaves the screen empty.

/**
 * The classes that Google Translate adds to the page's root element. Other translators, such as
 * Microsoft's, wrap the text that they change in `<font>` elements, which the website does not use.
 */
const TRANSLATED_CLASSES = ["translated-ltr", "translated-rtl"] as const;

/** Whether a translator changed the page's text. */
export function isTranslated(): boolean {
  return (
    TRANSLATED_CLASSES.some((className) =>
      document.documentElement.classList.contains(className),
    ) || document.querySelector("font") !== null
  );
}

/**
 * Lets React work on a page that a translator changed. A node that the translator moved away is not
 * removed again, and a node that goes before one is added at the end instead. A translated text can
 * then stay as it was until the translator sees the change, which is better than an empty screen.
 * On a page that no translator changed, these errors still happen, so they still show a bug in our
 * own code.
 */
export function allowTranslators(): void {
  /* eslint-disable @typescript-eslint/unbound-method -- They are called with their node. */
  const original = {
    insertBefore: Node.prototype.insertBefore,
    removeChild: Node.prototype.removeChild,
  };
  /* eslint-enable @typescript-eslint/unbound-method */

  Node.prototype.removeChild = function removeChild<T extends Node>(
    this: Node,
    child: T,
  ): T {
    return child.parentNode !== this && isTranslated()
      ? child
      : (original.removeChild.call(this, child) as T);
  };

  Node.prototype.insertBefore = function insertBefore<T extends Node>(
    this: Node,
    node: T,
    child: Node | null,
  ): T {
    return child !== null && child.parentNode !== this && isTranslated()
      ? (original.insertBefore.call(this, node, null) as T)
      : (original.insertBefore.call(this, node, child) as T);
  };
}
