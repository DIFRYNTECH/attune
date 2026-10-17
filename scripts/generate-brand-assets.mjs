import { mkdir, readdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve, join } from "node:path";
import sharp from "sharp";
import { brandSvg } from "./lib/attune-brand.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const publicDir = join(root, "public");
const res = join(root, "android/app/src/main/res");
const mark = brandSvg();
const icon = brandSvg({ tile: true });

async function png(svg, path, size) {
  await sharp(Buffer.from(svg)).resize(size, size).png().toFile(path);
}

export async function generateBrandAssets() {
  await mkdir(publicDir, { recursive: true });
  for (const name of ["attune-logo-final.svg", "attune-logo.svg"]) {
    await writeFile(join(publicDir, name), mark);
  }
  for (const name of ["attune-app-icon.svg", "attune-favicon.svg", "attune-email-logo.svg"]) {
    await writeFile(join(publicDir, name), icon);
  }
  await png(icon, join(publicDir, "attune-email-logo-v2.png"), 256);
  await png(icon, join(publicDir, "attune-app-icon.png"), 512);

  for (const [density, scale] of [["mdpi", 1], ["hdpi", 1.5], ["xhdpi", 2], ["xxhdpi", 3], ["xxxhdpi", 4]]) {
    const dir = join(res, `mipmap-${density}`);
    await mkdir(dir, { recursive: true });
    await png(icon, join(dir, "ic_launcher.png"), 48 * scale);
    await png(brandSvg({ tile: true, round: true }), join(dir, "ic_launcher_round.png"), 48 * scale);
    await png(brandSvg({ white: true, adaptive: true }), join(dir, "ic_launcher_foreground.png"), 108 * scale);
  }

  // Retain the native density/orientation dimensions while removing the template artwork.
  for (const entry of await readdir(res, { withFileTypes: true })) {
    if (!entry.isDirectory() || !/^drawable(?:-(?:land|port)-\w+)?$/.test(entry.name)) continue;
    const path = join(res, entry.name, "splash.png");
    let metadata;
    try { metadata = await sharp(path).metadata(); }
    catch (error) {
      if (error.message.includes("Input file is missing")) continue;
      throw error;
    }
    const size = Math.round(Math.min(metadata.width, metadata.height) * .4);
    const logo = await sharp(Buffer.from(mark)).resize(size, size).png().toBuffer();
    const output = await sharp({ create: { width: metadata.width, height: metadata.height, channels: 4, background: "#f0f2f5" } })
      .composite([{ input: logo, gravity: "centre" }]).png().toBuffer();
    await writeFile(path, output);
  }
  console.log("Generated web, email, Android launcher, and splash branding.");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await generateBrandAssets();
}
