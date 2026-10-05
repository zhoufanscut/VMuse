# Third-party theme licenses

The theme files in this folder (all `*.json` except `_builtin.json`) are
third-party works. They are **not** covered by the MIT license in the repo's
root `LICENSE`; each keeps its upstream license, listed below.

`_builtin.json` is a list of Shiki theme names written for Muse and falls under
the root `LICENSE`.

| File | Upstream | License | Our copy |
|------|----------|---------|----------|
| `bluloco-light.json` | [uloco/theme-bluloco-light](https://github.com/uloco/theme-bluloco-light) | LGPL-3.0 | Unmodified |
| `gruvbox-material-light.json` | [sainnhe/gruvbox-material-vscode](https://github.com/sainnhe/gruvbox-material-vscode) | MIT | Unmodified |
| `light-owl.json` | [sdras/night-owl-vscode-theme](https://github.com/sdras/night-owl-vscode-theme) | MIT | Unmodified |
| `tokyo-night-light.json` | [tokyo-night/tokyo-night-vscode-theme](https://github.com/tokyo-night/tokyo-night-vscode-theme) | MIT | Modified (`type`) |
| `winter-is-coming-light.json` | [johnpapa/vscode-winteriscoming](https://github.com/johnpapa/vscode-winteriscoming) | MIT | Unmodified |

"Unmodified" means the file parses to the same JSON as the upstream file at the
commit named below (whitespace and key order aside).

---

## bluloco-light.json

- Upstream file: [`themes/bluloco-light-color-theme.json`](https://github.com/uloco/theme-bluloco-light/blob/945de09af5ab5f833542fdea8d31943ca21180f5/themes/bluloco-light-color-theme.json)
  at commit `945de09af5ab5f833542fdea8d31943ca21180f5` (version 3.7.4)
- Copyright: Copyright (c) Umut Topuzoğlu (uloco). The upstream repo has no
  explicit copyright line; the holder is the repo owner and publisher.
- License: GNU Lesser General Public License v3.0 (LGPL-3.0)
- Changes: none. The file is distributed unmodified, as published upstream.

This file is free software: you can redistribute it and/or modify it under the
terms of the GNU Lesser General Public License as published by the Free
Software Foundation, version 3. It is distributed WITHOUT ANY WARRANTY; without
even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR
PURPOSE. See the license for details.

- LGPL-3.0 full text: <https://www.gnu.org/licenses/lgpl-3.0.txt>
  (also in the upstream repo: <https://github.com/uloco/theme-bluloco-light/blob/main/LICENSE>)
- The LGPL-3.0 adds terms to the GNU GPL v3.0, whose full text is at
  <https://www.gnu.org/licenses/gpl-3.0.txt>

The source of this file is the file itself (it is plain JSON), so anyone who
receives it from this repo also receives its complete source.

---

## gruvbox-material-light.json

- Upstream file: [`themes/gruvbox-material-light.json`](https://github.com/sainnhe/gruvbox-material-vscode/blob/433282617bad5d20d299af57713febd1aa37caed/themes/gruvbox-material-light.json)
  at commit `433282617bad5d20d299af57713febd1aa37caed` (the upstream repo is archived)
- License: MIT
- Changes: none

```
MIT License

Copyright (c) 2020 sainnhe

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

---

## light-owl.json

- Upstream file: [`themes/Night Owl-Light-color-theme.json`](https://github.com/sdras/night-owl-vscode-theme/blob/d298950d6378c36c027f1387e307ebf3f145fc90/themes/Night%20Owl-Light-color-theme.json)
  at commit `d298950d6378c36c027f1387e307ebf3f145fc90` (theme name "Night Owl Light")
- License: MIT
- Changes: none

```
MIT License

Copyright (c) 2018 Sarah Drasner

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

---

## tokyo-night-light.json

- Upstream file: [`themes/tokyo-night-light-color-theme.json`](https://github.com/tokyo-night/tokyo-night-vscode-theme/blob/da5546bc4163a02a30d6f3ced90d4ef7dfcb8460/themes/tokyo-night-light-color-theme.json)
  at commit `da5546bc4163a02a30d6f3ced90d4ef7dfcb8460` (formerly `enkia/tokyo-night-vscode-theme`)
- License: MIT
- Changes: `"type"` changed from `"dark"` to `"light"` (upstream declares this
  light theme as dark). Nothing else differs.

```
The MIT License (MIT)

Copyright (c) 2018-present Enkia

Permission is hereby granted, free of charge, to any person obtaining
a copy of this software and associated documentation files (the
"Software"), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to
permit persons to whom the Software is furnished to do so, subject to
the following conditions:

The above copyright notice and this permission notice shall be
included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE
LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION
WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
```

---

## winter-is-coming-light.json

- Upstream file: [`themes/WinterIsComing-light-color-theme.json`](https://github.com/johnpapa/vscode-winteriscoming/blob/be6256d082bb42bb9bb9f9e11c9f93b5e4393f96/themes/WinterIsComing-light-color-theme.json)
  at commit `be6256d082bb42bb9bb9f9e11c9f93b5e4393f96` (an older upstream version;
  later upstream versions add `semanticHighlighting` and more colors)
- License: MIT
- Changes: none

```
The MIT License (MIT)

Copyright (c) 2015-2017 JohnPapa.net, LLC

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
```
