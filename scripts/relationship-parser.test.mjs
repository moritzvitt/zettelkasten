import assert from "node:assert/strict"
import test from "node:test"
import {
  parseLinksSection,
  withInverseRelationships,
} from "./relationship-parser.mjs"

test("parses comma-separated relationship links with optional whitespace", () => {
  const result = parseLinksSection(`
# Example

%%
## Links

Prev::[[Before]]
Next:: [[After One]], [[Folder/After Two|After Two]]
Parent::   [[Parent Note]]
Child::
Friend:: [[Friend One]],[[Friend Two]]

## Tags
#example
%%
`)

  assert.deepEqual(result.byType, {
    Prev: ["Before"],
    Next: ["After One", "After Two"],
    Parent: ["Parent Note"],
    Child: [],
    Friend: ["Friend One", "Friend Two"],
  })
  assert.deepEqual(result.relationships, [
    { type: "prev", target: "Before" },
    { type: "next", target: "After One" },
    { type: "next", target: "After Two" },
    { type: "parent", target: "Parent Note" },
    { type: "friend", target: "Friend One" },
    { type: "friend", target: "Friend Two" },
  ])
})

test("only reads fields from the Links section", () => {
  const result = parseLinksSection(`
Next:: [[Outside Before]]

%%
## Links
Prev::
Next:: [[Inside]]
Parent::
Child::
Friend::

## Tags
#example
%%

Friend:: [[Outside After]]
`)

  assert.deepEqual(result.relationships, [{ type: "next", target: "Inside" }])
})

test("merges repeated fields and removes duplicate targets", () => {
  const result = parseLinksSection(`
## Links
Friend:: [[Same]], [[Other]]
Friend:: [[Same]]
`)

  assert.deepEqual(result.byType.Friend, ["Same", "Other"])
})

test("adds the inverse relationship for every resolved pair", () => {
  const result = withInverseRelationships([
    { from: "a", to: "b", type: "prev" },
    { from: "a", to: "c", type: "next" },
    { from: "a", to: "d", type: "parent" },
    { from: "a", to: "e", type: "child" },
    { from: "a", to: "f", type: "friend" },
  ])

  assert.deepEqual(result, [
    { from: "a", to: "b", type: "prev", explicit: true },
    { from: "b", to: "a", type: "next", explicit: false },
    { from: "a", to: "c", type: "next", explicit: true },
    { from: "c", to: "a", type: "prev", explicit: false },
    { from: "a", to: "d", type: "parent", explicit: true },
    { from: "d", to: "a", type: "child", explicit: false },
    { from: "a", to: "e", type: "child", explicit: true },
    { from: "e", to: "a", type: "parent", explicit: false },
    { from: "a", to: "f", type: "friend", explicit: true },
    { from: "f", to: "a", type: "friend", explicit: false },
  ])
})

test("keeps reciprocal explicit relationships explicit without duplicates", () => {
  const result = withInverseRelationships([
    { from: "a", to: "b", type: "next" },
    { from: "b", to: "a", type: "prev" },
  ])

  assert.deepEqual(result, [
    { from: "a", to: "b", type: "next", explicit: true },
    { from: "b", to: "a", type: "prev", explicit: true },
  ])
})
