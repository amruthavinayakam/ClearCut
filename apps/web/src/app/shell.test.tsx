import { render, screen, within } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { BootScreen, failed, ready } from "./(product)/_components/boot-screen";
import { ProductShell } from "./(product)/_components/product-shell";

describe("product boot", () => {
  test("configuration failure recovers independently from ready projects", () => {
    render(<BootScreen config={failed("config")} projects={ready([])} />);

    expect(screen.getByTestId("boot-config")).toHaveTextContent("RETRY");
    expect(screen.getByTestId("boot-projects")).toHaveTextContent("READY");
  });
});

describe("product shell", () => {
  test("locates the reader with a breadcrumb trail", () => {
    render(
      <ProductShell>
        <div />
      </ProductShell>,
    );

    // At the root, Productions is where you are, so it is the final crumb and
    // deliberately not a link. "New scan" is the page's own action now, not
    // shell chrome competing with each screen's primary button.
    const trail = screen.getByRole("navigation", { name: "Breadcrumb" });
    expect(within(trail).getByText("Productions")).toBeVisible();
    expect(screen.getByRole("link", { name: "ClearCut" })).toBeVisible();
    expect(screen.queryByRole("link", { name: "New scan" })).not.toBeInTheDocument();
  });
});
