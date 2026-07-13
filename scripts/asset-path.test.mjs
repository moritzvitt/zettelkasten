import assert from "node:assert/strict"
import test from "node:test"

import { assetHref } from "./asset-path.mjs"

test("leaves local asset punctuation for Quartz to normalize once", () => {
  const href = assetHref("attachments/IMSLP504311-Tchaikovsky_in_F_minor,_Op.36;_TH_27.pdf")

  assert.equal(href, "./IMSLP504311-Tchaikovsky_in_F_minor,_Op.36;_TH_27.pdf")
  assert.doesNotMatch(href, /%2C|%3B|percent2c|percent3b/i)
})
