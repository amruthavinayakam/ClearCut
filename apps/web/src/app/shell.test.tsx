import { render, screen } from "@testing-library/react";
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
  test("exposes the primary product navigation", () => {
    render(
      <ProductShell>
        <div />
      </ProductShell>,
    );

    expect(screen.getByRole("link", { name: "Productions" })).toBeVisible();
    expect(screen.getByRole("link", { name: "New scan" })).toBeVisible();
  });
});
