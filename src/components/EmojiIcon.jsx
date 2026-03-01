import { emojiAssetUrl } from "../lib/emojiAssets";

export default function EmojiIcon({
  id,
  alt = "",
  title,
  size,
  className = "",
  fallback,
}) {
  const src = emojiAssetUrl(id);

  if (!src) {
    if (!fallback) return null;
    return (
      <span className={("emojiFallback " + className).trim()} aria-hidden="true">
        {fallback}
      </span>
    );
  }

  const style =
    size === undefined
      ? undefined
      : {
          width: size,
          height: size,
        };

  return (
    <img
      className={("emojiIcon " + className).trim()}
      src={src}
      alt={alt}
      title={title}
      style={style}
      loading="lazy"
      draggable="false"
      aria-hidden={alt ? undefined : true}
    />
  );
}
