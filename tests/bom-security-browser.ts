import assert from "node:assert/strict";
import type { Page } from "playwright";
import type { Client } from "pg";
import { randomUUID } from "node:crypto";
import { submitControl } from "./confirmation-browser";
export async function exerciseBomSecurity(
  page: Page,
  db: Client,
  origin: string,
  owner: string,
  capture: (name: string) => Promise<void>,
  accessible: () => Promise<void>,
) {
  await db.query("update erp_modules set state='active'");
  const suffix = randomUUID().slice(0, 8),
    code = "BS-" + suffix,
    secret = "A separate BOM password 2026";
  const insert = async (sql: string, args: unknown[] = []) =>
    (await db.query(sql + " returning id", args)).rows[0].id as string;
  const unit = await insert(
    "insert into erp_units(code,name) values($1,'Kilogram')",
    [code],
  );
  const product = await insert(
    "insert into master_produk(kode_produk,nama_produk,kategori,satuan,status_halal,tipe_kemasan) values($1,$2,'Chemical','kg','Halal','Bag')",
    [code, "Protected product " + suffix],
  );
  await db.query(
    "insert into erp_product_units(product_id,unit_id,factor,is_base) values($1,$2,1,true)",
    [product, unit],
  );
  const material = await insert(
    "insert into erp_materials(code,name,unit_id) values($1,$2,$3)",
    [code, "Secret ingredient " + suffix, unit],
  );
  const guest = await insert(
    "insert into users(username,password_hash,role,nama_lengkap) values($1,'test','administrator inbionusa',$2)",
    [randomUUID(), "BOM guest " + suffix],
  );
  const guestToken = randomUUID();
  await db.query(
    "insert into sessions(user_id,token,expires_at) values($1,$2,now()+interval '1 hour')",
    [guest, guestToken],
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(origin + "/dashboard/production/formulas");
  await page.getByRole("button", { name: "New formula", exact: true }).click();
  const form = page.getByRole("dialog", { name: "New formula", exact: true });
  await form.getByLabel("BOM password", { exact: true }).fill(secret);
  await form.getByLabel("Confirm BOM password", { exact: true }).fill(secret);
  await capture("bom-mobile-password-setup");
  await form
    .getByRole("textbox", { name: "Formula name", exact: true })
    .fill("Protected BOM " + suffix);
  const choose = async (label: string, search: string) => {
    await form.getByRole("combobox", { name: label, exact: true }).click();
    const picker = page.locator(".work-picker");
    await picker.getByRole("textbox").fill(search);
    await picker.getByRole("option").first().click();
  };
  await choose("Finished product", "Protected product " + suffix);
  await form.locator('[data-field-path="output_quantity"] input').fill("100");
  await choose("Material", "Secret ingredient " + suffix);
  await form
    .locator('[data-field-path="lines.0.quantity"] input')
    .fill("17,25");
  await form
    .locator('[data-field-path="notes"] textarea')
    .fill("BOM SECRET " + suffix);
  assert.equal(
    await page.evaluate(
      () =>
        Object.keys(localStorage).filter(
          (k) =>
            k.startsWith("inb:draft:") && k.includes("/dashboard/production"),
        ).length,
    ),
    0,
    "confidential formulas never enter local draft storage",
  );
  await capture("bom-mobile-create-protected");
  await accessible();
  const response = page.waitForResponse(
    (r) =>
      r.url().endsWith("/api/operations/save_formula") &&
      r.request().method() === "POST",
  );
  await form.getByRole("button", { name: "Save", exact: true }).click();
  const saved = await response;
  assert.equal(saved.status(), 200, await saved.text());
  const formula = (await saved.json()).id;
  await page.getByRole("button", { name: "Lock BOM", exact: true }).waitFor();
  await capture("bom-mobile-owner-unlocked");
  await accessible();
  await page.getByRole("button", { name: "Lock BOM", exact: true }).click();
  await page.getByRole("button", { name: "Unlock BOM", exact: true }).waitFor();
  assert.equal(
    await page.getByText("BOM SECRET " + suffix, { exact: true }).count(),
    0,
  );
  const locked = await (
    await page.request.get(origin + "/api/operations/formulas?id=" + formula)
  ).json();
  assert.equal(locked.rows[0].lines, undefined);
  const history = await (
    await page.request.get(
      origin + "/api/operations/history?source=formulas&id=" + formula,
    )
  ).json();
  assert.ok(!JSON.stringify(history).includes("Secret ingredient " + suffix));
  const originDenied = await page.request.post(origin + "/api/bom-security", {
    headers: { origin: "https://untrusted.example" },
    data: { action: "unlock", formula_id: formula, password: secret },
  });
  assert.equal(originDenied.status(), 403);
  await page.getByLabel("BOM password", { exact: true }).fill("Wrong password");
  await page.getByRole("button", { name: "Unlock BOM", exact: true }).click();
  await page
    .getByRole("alert")
    .filter({ hasText: "Incorrect BOM password." })
    .waitFor();
  await page.getByLabel("BOM password", { exact: true }).fill(secret);
  await page.getByRole("button", { name: "Unlock BOM", exact: true }).click();
  await page
    .getByRole("button", { name: "Manage BOM access", exact: true })
    .click();
  const browser = page.context().browser()!;
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  try {
    await ctx.addCookies([
      {
        name: "session_token",
        value: guestToken,
        url: origin,
        httpOnly: true,
        sameSite: "Lax",
      },
    ]);
    const guestPage = await ctx.newPage();
    await guestPage.goto(
      origin + "/dashboard/production/formulas?record=" + formula,
    );
    await guestPage
      .getByText(
        "Ask the BOM owner to grant you access. Production read permission is also required.",
        { exact: true },
      )
      .waitFor();
    const denied = await guestPage.request.post(origin + "/api/bom-security", {
      headers: { origin },
      data: { action: "unlock", formula_id: formula, password: secret },
    });
    assert.equal(denied.status(), 403);
    await page
      .getByLabel("Grant BOM access", { exact: true })
      .selectOption(guest);
    await page
      .getByRole("button", { name: "Grant access", exact: true })
      .click();
    await page
      .getByRole("listitem")
      .filter({ hasText: "BOM guest " + suffix })
      .waitFor();
    await guestPage.reload();
    await guestPage.getByLabel("BOM password", { exact: true }).fill(secret);
    await guestPage
      .getByRole("button", { name: "Unlock BOM", exact: true })
      .click();
    await guestPage
      .getByRole("button", { name: "Lock BOM", exact: true })
      .waitFor();
    assert.ok(
      (
        await (
          await guestPage.request.get(
            origin + "/api/operations/formulas?id=" + formula,
          )
        ).json()
      ).rows[0].lines,
    );
    await capture("bom-mobile-owner-grants");
    await accessible();
    await page
      .getByRole("listitem")
      .filter({ hasText: "BOM guest " + suffix })
      .getByRole("button", { name: "Revoke access", exact: true })
      .click();
    await submitControl(
      page.getByRole("dialog", { name: "Revoke BOM access?", exact: true }),
      "Revoke access",
    );
    await page
      .getByRole("listitem")
      .filter({ hasText: "BOM guest " + suffix })
      .waitFor({ state: "detached" });
    const hidden = await (
      await guestPage.request.get(
        origin + "/api/operations/formulas?id=" + formula,
      )
    ).json();
    assert.equal(hidden.rows[0].lines, undefined);
    await guestPage.reload();
    await guestPage
      .getByText(
        "Ask the BOM owner to grant you access. Production read permission is also required.",
        { exact: true },
      )
      .waitFor();
    // Expiry closes an active editing dialog and clears the formula from the screen.
    await db.query(
      "update erp_bom_unlocks set expires_at=now()+interval '4 seconds' where root_id=(select root_id from erp_formulas where id=$1) and session_token in(select token from sessions where user_id=$2)",
      [formula, owner],
    );
    await page.reload();
    await page
      .getByRole("button", { name: "Edit formula", exact: true })
      .click();
    await page
      .getByRole("dialog", { name: "Edit formula", exact: true })
      .waitFor();
    await page
      .getByRole("button", { name: "Unlock BOM", exact: true })
      .waitFor();
    assert.equal(
      await page
        .getByRole("dialog", { name: "Edit formula", exact: true })
        .count(),
      0,
    );
    await capture("bom-mobile-expired");
    await accessible();
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.reload();
    await capture("bom-desktop-locked");
    await accessible();
    // Indonesian copy is available without translating stored material names.
    await page.evaluate(() => {
      localStorage.setItem("inb:locale", "id");
      window.dispatchEvent(new Event("storage"));
    });
    await page.getByRole("button", { name: "Buka BOM", exact: true }).waitFor();
    await capture("bom-indonesian-locked");
    await page.evaluate(() => {
      localStorage.setItem("inb:locale", "en");
      window.dispatchEvent(new Event("storage"));
    });
  } finally {
    await ctx.close();
  }
  assert.ok(material);
}
