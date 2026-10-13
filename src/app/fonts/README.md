# Fonts

`src/app/[locale]/layout.tsx` loads these files with `next/font/local`, so
builds do not reach Google Fonts.

| File                             | Family            | Weights used |
| -------------------------------- | ----------------- | ------------ |
| `Inter-Variable.woff2`           | Inter             | 400–700      |
| `PlusJakartaSans-Variable.woff2` | Plus Jakarta Sans | 500–800      |
| `JetBrainsMono-Variable.woff2`   | JetBrains Mono    | 400–500      |

Each file is the variable font Google Fonts serves for that family, built from
the same source TTF in [google/fonts](https://github.com/google/fonts) and
merged across the latin, latin-ext, cyrillic and cyrillic-ext subsets. Plus
Jakarta Sans has no cyrillic glyphs, so Russian headings fall back to the
system font, as they did with Google Fonts.

To rebuild them, for example after bumping `GOOGLE_FONTS_COMMIT`:

```sh
uv run --no-project --with fonttools==4.66.1 --with brotli==1.2.0 python scripts/build-fonts.py
```

The script pins the source TTFs to `GOOGLE_FONTS_COMMIT` but reads the subset
unicode ranges live from the Google Fonts css2 API, so a rebuild can pick up
range changes Google has made since.

All three families are licensed under the SIL Open Font License 1.1; the
`*-OFL.txt` files hold each license.
