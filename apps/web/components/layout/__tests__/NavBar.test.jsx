import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import NavBar from "../NavBar.jsx";

function renderNavBar(initialPath = "/") {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <NavBar />
    </MemoryRouter>,
  );
}

describe("NavBar", () => {
  it("renders the main destinations with descriptive accessible names and correct hrefs", () => {
    renderNavBar();

    const nav = screen.getByRole("navigation", { name: /main navigation/i });

    expect(within(nav).getByRole("link", { name: /go to learn genetics/i })).toHaveAttribute("href", "/learn");
    expect(within(nav).getByRole("link", { name: /go to explore genes and diseases/i })).toHaveAttribute("href", "/explore");
    expect(within(nav).getByRole("link", { name: /go to upload and interpret my data/i })).toHaveAttribute("href", "/upload");
    expect(within(nav).getByRole("link", { name: /go to find matching trials/i })).toHaveAttribute("href", "/trials");
  });
});
