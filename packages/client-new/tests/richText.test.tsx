// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { RichText } from "../src/ui/RichText";

afterEach(cleanup);

it("never turns untrusted scripts, images or option buttons into active content", () => {
  const view = render(
    <RichText
      html={
        '<script>alert(1)</script><img src="https://example.invalid/track"><a href="javascript:alert(1)">Unsafe</a><button data-new-options="{}">Apply</button>'
      }
    />,
  );
  expect(view.container.querySelector("script,img")).toBeNull();
  expect(screen.queryByRole("link")).toBeNull();
  expect(screen.queryByRole("button")).toBeNull();
  expect(screen.getByText("Unsafe")).toBeDefined();
  expect(screen.getByText("Apply")).toBeDefined();
});

it("exposes an explicit trusted options callback without nesting automatic links", async () => {
  const apply = vi.fn();
  const view = render(
    <RichText
      html={
        '<button data-new-options="{&quot;variantName&quot;:&quot;No Variant&quot;}">Use options</button><a href="https://example.com">https://example.com</a>'
      }
      onOptions={apply}
    />,
  );
  await userEvent.click(screen.getByRole("button", { name: "Use options" }));
  expect(apply).toHaveBeenCalledWith('{"variantName":"No Variant"}');
  expect(view.container.querySelectorAll("a")).toHaveLength(1);
  expect(view.container.querySelector(":scope a a")).toBeNull();
});

it("renders shared emotes and keeps code examples literal", () => {
  const view = render(<RichText html="Kappa :smile: <code>Kappa</code>" />);
  expect(screen.getAllByRole("img")).toHaveLength(1);
  expect(screen.getByRole("img", { name: "Kappa" }).getAttribute("src")).toBe(
    "/public/img/emotes/twitch/Kappa.png",
  );
  expect(view.container.querySelector("code")?.textContent).toBe("Kappa");
  expect(view.container.textContent).not.toContain(":smile:");
});
