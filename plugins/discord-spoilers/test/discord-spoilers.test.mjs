import test from "node:test"
import assert from "node:assert/strict"
import {
  splitDiscordSpoilerElements,
  splitDiscordSpoilers,
  spoilerElement,
  spoilerHtml,
} from "../src/index.js"

test("renders Discord inline spoiler text as an HTML span", () => {
  assert.equal(
    spoilerHtml("おしかつ"),
    '<span class="discord-spoiler" tabindex="0" role="button" aria-label="Spoiler"><span>おしかつ</span></span>',
  )
})

test("splits text around one spoiler", () => {
  assert.deepEqual(splitDiscordSpoilers("foo ||bar|| baz"), [
    { type: "text", value: "foo " },
    { type: "html", value: spoilerHtml("bar") },
    { type: "text", value: " baz" },
  ])
})

test("supports multiple spoilers in one text node", () => {
  assert.deepEqual(splitDiscordSpoilers("||one|| and ||two||"), [
    { type: "html", value: spoilerHtml("one") },
    { type: "text", value: " and " },
    { type: "html", value: spoilerHtml("two") },
  ])
})

test("escapes HTML inside spoilers", () => {
  assert.equal(
    spoilerHtml("<script>alert(\"x\")</script>"),
    '<span class="discord-spoiler" tabindex="0" role="button" aria-label="Spoiler"><span>&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;</span></span>',
  )
})

test("can split spoiler text in HTML nodes such as Obsidian highlights", () => {
  assert.deepEqual(splitDiscordSpoilerElements("== ||推し活|| =="), [
    { type: "text", value: "== " },
    spoilerElement("推し活"),
    { type: "text", value: " ==" },
  ])
})

test("leaves text without spoilers untouched", () => {
  assert.deepEqual(splitDiscordSpoilers("ordinary text"), [
    { type: "text", value: "ordinary text" },
  ])
})
