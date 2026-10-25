import assert from "node:assert/strict";
import type { Page } from "playwright";
export async function exerciseBilingualRelease(
  page: Page,
  origin: string,
  capture: (name: string) => Promise<void>,
) {
  // Existing authenticated fixture remains available while reviewing the public login.
  await page.goto(origin + "/login");
  for (const size of [
    { width: 320, height: 568 },
    { width: 390, height: 844 },
    { width: 844, height: 390 },
  ]) {
    await page.setViewportSize(size);
    await page.getByLabel("Language", { exact: true }).selectOption("id");
    await page.getByRole("heading", { name: "Masuk", exact: true }).waitFor();
    await page.getByRole("button", { name: "Masuk", exact: true }).waitFor();
    await page
      .getByLabel("Nama pengguna", { exact: true })
      .fill("operator-test");
    assert.equal(await page.locator("html").getAttribute("lang"), "id");
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
    );
    const password = page.getByLabel("Kata sandi", { exact: true });
    await password.fill("Typed value remains unchanged");
    await page.getByLabel("Bahasa", { exact: true }).selectOption("en");
    assert.equal(
      await page.getByLabel("Password", { exact: true }).inputValue(),
      "Typed value remains unchanged",
    );
    assert.equal(
      await page.getByLabel("Username", { exact: true }).inputValue(),
      "operator-test",
    );
    await page.getByLabel("Language", { exact: true }).selectOption("id");
    await capture(`login-id-${size.width}`);
    await page.reload();
    await page.getByRole("heading", { name: "Masuk", exact: true }).waitFor();
    await page.getByLabel("Bahasa", { exact: true }).selectOption("en");
  }
  await page.getByRole("button", { name: "Dark theme", exact: true }).click();
  await capture("login-dark-mobile");
  await page.getByRole("button", { name: "Light theme", exact: true }).click();
  await page.getByLabel("Language", { exact: true }).selectOption("id");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(origin + "/dashboard/warehouse/pallets");
  await page
    .getByRole("heading", { name: "Pelacakan palet", exact: true })
    .waitFor();
  await page
    .getByRole("button", { name: "Buka menu akun", exact: true })
    .click();
  await page
    .getByRole("menuitemradio", { name: "English", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Pallet tracking", exact: true })
    .waitFor();
  await page
    .getByRole("menuitemradio", { name: "Bahasa Indonesia", exact: true })
    .click();
  await page.keyboard.press("Escape");
  await page
    .getByRole("button", { name: "Pilih halaman", exact: true })
    .click();
  const menu = page.locator(".mobile-page-menu");
  await menu.waitFor();
  await capture("mobile-grouped-navigation-id");
  const active = menu.locator('a[aria-current="page"]');
  assert.equal(
    await active.evaluate((el) => getComputedStyle(el).display),
    "flex",
  );
  assert.ok(
    await active.evaluate((el) => el.getBoundingClientRect().height >= 44),
  );
  assert.ok((await menu.locator("details").count()) >= 4);
  await menu
    .locator("details")
    .filter({ has: page.locator("summary", { hasText: "Persediaan" }) })
    .locator("summary")
    .click();
  await menu.getByRole("link", { name: "Stok", exact: true }).click();
  await page.waitForURL((url) => url.searchParams.get("view") === "stock");
  await page.goto(origin + "/dashboard/sales?view=quotes");
  await page
    .getByRole("button", { name: "Penawaran baru", exact: true })
    .click();
  await page.getByLabel("Tanggal penawaran", { exact: true }).waitFor();
  await capture("quotation-id-mobile");
  assert.equal(
    await page
      .getByRole("dialog")
      .first()
      .evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
    true,
  );
  await page.goto(origin + "/dashboard/warehouse/pallets");
  await page.setViewportSize({ width: 1440, height: 1000 });
  const expandSidebar = page.getByRole("button", {
    name: "Perluas menu samping",
    exact: true,
  });
  if (await expandSidebar.isVisible()) await expandSidebar.click();
  const sidebar = page.locator(
    ".workspace-sidebar-nav:not(.collapsed-navigation)",
  );
  await sidebar.getByRole("searchbox").fill("palet");
  await sidebar
    .getByRole("link", { name: "Pelacakan palet", exact: true })
    .waitFor();
  await sidebar.getByRole("searchbox").fill("");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(origin + "/dashboard/warehouse/pallets");
  await page
    .getByRole("heading", { name: "Pelacakan palet", exact: true })
    .waitFor();
  assert.equal(
    await page
      .locator(".workspace-main > .surface-enter")
      .evaluate((el) => getComputedStyle(el).animationName),
    "none",
  );
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto(origin + "/login");
  await page.getByLabel("Bahasa", { exact: true }).selectOption("en");
  await page.goto(origin + "/dashboard/quality");
}
