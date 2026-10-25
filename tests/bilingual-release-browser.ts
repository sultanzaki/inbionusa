import assert from "node:assert/strict";
import type { Page } from "playwright";
export async function exerciseBilingualRelease(
  page: Page,
  origin: string,
  capture: (name: string) => Promise<void>,
) {
  const selectLocale = async (value: "en" | "id") => {
    await page.evaluate(value => {
      localStorage.setItem("inb:locale", value);
      window.dispatchEvent(new Event("storage"));
    }, value);
  };
  // Existing authenticated fixture remains available while reviewing the public login.
  await page.goto(origin + "/login");
  for (const size of [
    { width: 320, height: 568 },
    { width: 390, height: 844 },
    { width: 844, height: 390 },
  ]) {
    await page.setViewportSize(size);
    await selectLocale("id");
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
    await selectLocale("en");
    assert.equal(
      await page.getByLabel("Password", { exact: true }).inputValue(),
      "Typed value remains unchanged",
    );
    assert.equal(
      await page.getByLabel("Username", { exact: true }).inputValue(),
      "operator-test",
    );
    await selectLocale("id");
    assert.equal(await page.locator(".login-brand-scene").count(), 0);
    await page.locator(".login-mobile-brand").waitFor();
    if (size.height >= 568) {
      assert.ok(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 1), "portrait login has no unnecessary vertical scroll");
    }
    assert.ok(await page.evaluate(() => getComputedStyle(document.body).backgroundColor === getComputedStyle(document.querySelector(".login-form-panel")!).backgroundColor), "document background matches the login panel");
    await capture(`login-id-${size.width}`);
    await page.reload();
    await page.getByRole("heading", { name: "Masuk", exact: true }).waitFor();
    await selectLocale("en");
  }
  assert.equal(await page.getByRole("combobox").count(), 0);
  assert.equal(await page.locator(".theme-control, .login-footer, .login-preferences").count(), 0);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => { localStorage.setItem("inb-appearance", "dark"); });
  await page.reload();
  await page.waitForFunction(() => document.documentElement.classList.contains("dark"));
  await capture("login-dark-mobile");
  assert.ok(await page.evaluate(() => getComputedStyle(document.body).backgroundColor === getComputedStyle(document.querySelector(".login-form-panel")!).backgroundColor), "dark login has no white document background");
  await page.setViewportSize({ width: 390, height: 360 });
  await page.getByLabel("Password", { exact: true }).focus();
  const submit = page.getByRole("button", { name: "Sign in", exact: true });
  await submit.scrollIntoViewIfNeeded();
  assert.ok(await submit.evaluate(el => { const r = el.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; }), "submit remains reachable in a keyboard-sized viewport");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => scrollTo(0, 0));
  await page.emulateMedia({ reducedMotion: "reduce" });
  assert.equal(await page.locator(".login-form-panel").evaluate(el => getComputedStyle(el, "::before").animationName), "none");
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.evaluate(() => { localStorage.setItem("inb-appearance", "light"); });
  await page.reload();
  await selectLocale("id");
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
  await selectLocale("en");
  await page.goto(origin + "/dashboard/quality");
}
