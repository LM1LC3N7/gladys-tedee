# Third-party notices

This integration is licensed under the Apache License 2.0 (see `LICENSE`). It
contains logic ported to JavaScript from the project below, under its own
license.

## aiotedee

- Project: https://github.com/zweckj/aiotedee
- Used for: the local Bridge API client (endpoints, `api_token` header in
  hashed and plain modes, unlock modes), the lock, door and device type enums,
  the reading of the lock list (state, `jammed`, `doorState`, battery,
  charging, pull spring settings). Ported in `src/bridge.js`,
  `src/constants.js` and `src/tedee.js`; no file was copied as is.

```
MIT License

Copyright (c) 2026 Josef Zweck

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

## Tedee Bridge API documentation

The official documentation of the Tedee Bridge local API
(https://docs.tedee.com/bridge-api) describes the protocol this integration
speaks. Tedee is a trademark of its owner; this integration is unofficial and
not affiliated with Tedee.
