// Shared geometry for the approved folded-ribbon A and its rising inner path.
export const brandColor = "#7f8fcf";

const outline = "M202 522C243 447 282 371 320 298C339 264 352 246 366 242C381 232 395 229 410 232C459 241 484 306 510 365L575 522C518 526 483 510 469 463C450 407 436 337 416 288C412 278 409 272 405 270C391 265 381 291 365 331L317 454C300 505 265 527 202 522Z";
const foldedFace = "M202 522C243 447 282 371 320 298C339 264 352 246 366 242C382 241 398 254 405 270C391 265 381 291 365 331L317 454C300 505 265 527 202 522Z";
const innerPath = "M315 483C342 426 376 382 437 380L447 417C397 419 357 449 315 483Z";

export function brandSvg({ tile = false, white = tile, round = false, adaptive = false } = {}) {
  const colors = white
    ? ["#ffffff", "#eef1ff", "#dce3ff", "#ffffff"]
    : ["#929edc", "#7f8fcf", "#7386d1", "#b4bfee"];
  const background = tile
    ? `<rect width="512" height="512" rx="${round ? 256 : 112}" fill="url(#tile)"/>`
    : "";
  const scale = adaptive ? ' transform="translate(256 256) scale(.64) translate(-256 -256)"' : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" fill="none">
  <title>Attune</title>
  <defs>
    <linearGradient id="tile" x1="64" y1="0" x2="448" y2="512" gradientUnits="userSpaceOnUse"><stop stop-color="#97a4de"/><stop offset="1" stop-color="${brandColor}"/></linearGradient>
    <linearGradient id="ribbon" x1="390" y1="232" x2="552" y2="522" gradientUnits="userSpaceOnUse"><stop stop-color="${colors[0]}"/><stop offset="1" stop-color="${colors[1]}"/></linearGradient>
    <linearGradient id="face" x1="340" y1="244" x2="235" y2="522" gradientUnits="userSpaceOnUse"><stop stop-color="${colors[1]}"/><stop offset=".55" stop-color="${colors[2]}"/><stop offset="1" stop-color="${colors[1]}"/></linearGradient>
    <linearGradient id="path" x1="329" y1="470" x2="437" y2="380" gradientUnits="userSpaceOnUse"><stop stop-color="${colors[2]}"/><stop offset="1" stop-color="${colors[0]}"/></linearGradient>
  </defs>
${background}
  <g${scale}>
    <g transform="translate(-132 -121)">
      <path d="${outline}" fill="url(#ribbon)"/>
      <path d="${foldedFace}" fill="url(#face)"/>
      <path d="M366 242C382 241 398 254 405 270" stroke="${colors[3]}" stroke-width="1.8" stroke-linecap="round"/>
      <path d="${innerPath}" fill="url(#path)"/>
    </g>
  </g>
</svg>
`;
}
