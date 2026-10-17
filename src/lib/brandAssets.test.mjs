import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import sharp from "sharp";
import { brandSvg } from "../../scripts/lib/attune-brand.mjs";

const root = new URL("../../", import.meta.url);
const read = path => readFile(new URL(path, root), "utf8");
const normalize = text => text.replaceAll("\r\n", "\n");

test("published SVG variants use the same approved ribbon geometry", async () => {
  for (const name of ["attune-logo.svg", "attune-logo-final.svg"]) {
    assert.equal(normalize(await read(`public/${name}`)), brandSvg());
  }
  for (const name of ["attune-app-icon.svg", "attune-favicon.svg", "attune-email-logo.svg"]) {
    assert.equal(normalize(await read(`public/${name}`)), brandSvg({ tile: true }));
  }
});

test("email and touch-icon PNGs are deterministic vector exports", async () => {
  for (const [name, size] of [["attune-email-logo-v2.png", 256], ["attune-app-icon.png", 512]]) {
    const actual = await readFile(new URL(`public/${name}`, root));
    const expected = await sharp(Buffer.from(brandSvg({ tile: true }))).resize(size, size).png().toBuffer();
    assert.deepEqual(actual, expected);
    const { data, info } = await sharp(actual).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    assert.equal(info.width, size);
    assert.equal(info.height, size);
    assert.equal(data[3], 0, "rounded corners remain transparent");
    assert.equal(data[((size / 2) * size + size / 2) * 4 + 3], 255, "icon centre is painted");
  }
});

test("all Android launcher densities have generated, safely padded foregrounds", async () => {
  for (const [density, scale] of [["mdpi", 1], ["hdpi", 1.5], ["xhdpi", 2], ["xxhdpi", 3], ["xxxhdpi", 4]]) {
    const path = `android/app/src/main/res/mipmap-${density}/`;
    for (const [file, size, svg] of [
      ["ic_launcher.png", 48 * scale, brandSvg({ tile: true })],
      ["ic_launcher_round.png", 48 * scale, brandSvg({ tile: true, round: true })],
      ["ic_launcher_foreground.png", 108 * scale, brandSvg({ white: true, adaptive: true })],
    ]) {
      assert.deepEqual(await readFile(new URL(path + file, root)),
        await sharp(Buffer.from(svg)).resize(size, size).png().toBuffer());
      if (file === "ic_launcher_foreground.png") {
        const { data } = await sharp(Buffer.from(svg)).resize(size, size).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
        for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
          if (data[(y * size + x) * 4 + 3] < 128) continue;
          assert.ok(Math.hypot(x + .5 - size / 2, y + .5 - size / 2) < size * 33 / 108, "mark stays inside Android's 66dp safe circle");
        }
      }
    }
  }
});

test("header styles render the full icon without the old oversized masks", async () => {
  for (const file of ["src/index.css", "src/app-theme.css", "src/landing.css"]) {
    const css = await read(file);
    assert.ok(css.includes('/attune-app-icon.svg?v=2'));
    assert.ok(!css.includes('--logoMarkScale'));
    assert.ok(!css.includes('mask-image: url("/attune-logo-final.svg")'));
  }
  assert.ok((await read("index.html")).includes('/attune-favicon.svg?v=4'));
});

const tokens = {
  "confirm-sign-up": ["ConfirmationURL"],
  "invite-user": ["SiteURL", "ConfirmationURL"],
  "magic-link-or-otp": ["Token"],
  "change-email-address": ["Email", "NewEmail", "ConfirmationURL"],
  "reset-password": ["ConfirmationURL"],
  "reauthentication": ["Token"],
  "password-changed": ["Email"],
  "email-address-changed": ["OldEmail", "Email"],
  "phone-number-changed": ["Email", "OldPhone", "Phone"],
  "sign-in-method-linked": ["Provider", "Email"],
  "sign-in-method-removed": ["Provider", "Email"],
  "mfa-method-added": ["FactorType", "Email"],
  "mfa-method-removed": ["FactorType", "Email"],
};

test("all hosted email bodies are versioned and preserve their auth contracts", async () => {
  const files = await readdir(new URL("supabase/email-templates/", root));
  assert.equal(files.filter(file => file.endsWith(".html")).length, 13);
  for (const [name, expected] of Object.entries(tokens)) {
    const html = await read(`supabase/email-templates/${name}.html`);
    assert.deepEqual([...html.matchAll(/\{\{\s*\.(\w+)\s*\}\}/g)].map(match => match[1]), expected, name);
    assert.ok(html.includes('src="https://uat.useattune.co/attune-email-logo-v2.png"'), name);
    assert.ok(html.includes('alt="Attune"'), name);
    assert.ok(!/<svg|data:image|<script/i.test(html), name);
    if (expected.includes("ConfirmationURL")) assert.ok(html.includes('href="{{ .ConfirmationURL }}"'), name);
    if (["password-changed", "email-address-changed", "phone-number-changed", "sign-in-method-linked", "sign-in-method-removed", "mfa-method-added", "mfa-method-removed"].includes(name)) {
      assert.ok(html.includes("If you did not make this change, please contact support"), name);
    }
  }
});
