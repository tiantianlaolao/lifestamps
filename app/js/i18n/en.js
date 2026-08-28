// ============================================================
// English. Only keys that differ from the Chinese baseline need to live here —
// anything missing falls back to zh.js, so a partial dictionary never breaks the UI.
//
// Fonts: English uses a plain Latin stack (see [data-lang="en"] in app.css).
// Chinese webfonts carry Latin glyphs, but their weight and spacing are wrong.
//
// letter-spacing: the Chinese UI leans on it heavily (79 places). English must
// NOT inherit that — spaced-out Latin destroys word recognition.
// ============================================================

export const EN = {
  // names: { ink: {...}, stamp: {...}, cat: {...}, hidden: {...} }
  // ⚠️ Stamp / ink / category names are still pending — they fall back to Chinese
  //    until translated. Do not machine-translate: several are memes.
};
