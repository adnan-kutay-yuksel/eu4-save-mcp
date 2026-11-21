import { test } from "node:test";
import assert from "node:assert/strict";
import { all, getPath, isDupList, list, parseClausewitz, searchTree } from "../src/core/clausewitz.ts";

test("parses scalars, nested objects, arrays and duplicate keys", () => {
  const o = parseClausewitz(`a=1 b="hello world" c=1444.11.11 d={ 1 2 3 } e={ x=yes } e={ x=no } f={ { a=1 } { a=2 } } g=-3.5`);
  assert.equal(o.a, 1);
  assert.equal(o.b, "hello world");
  assert.equal(o.c, "1444.11.11");
  assert.deepEqual(o.d, [1, 2, 3]);
  assert.ok(isDupList(o.e));
  assert.equal(all(o, "e").length, 2);
  assert.deepEqual(o.f, [{ a: 1 }, { a: 2 }]);
  assert.equal(o.g, -3.5);
});

test("handles comments, operators, colors, key{ without =, escapes and stray braces", () => {
  const o = parseClausewitz(`# comment\nx = rgb { 10 20 30 } # trailing\nlimit={ age > 30 }\nmap_area_data{ a=1 }\ns="say \\"hi\\""\n}\nz=2`);
  assert.deepEqual(o.x, { rgb: [10, 20, 30] });
  assert.deepEqual(getPath(o, "limit.age"), { ">": 30 });
  assert.equal(getPath(o, "map_area_data.a"), 1);
  assert.equal(o.s, 'say "hi"');
  assert.equal(o.z, 2);
});

test("skip predicate drops subtrees and mixed blocks keep items", () => {
  const o = parseClausewitz(`keep={ a=1 } drop={ big={ 1 2 3 } } mixed={ 1 2 k=v }`, { skip: (p) => p[0] === "drop" });
  assert.equal(o.drop, undefined);
  assert.deepEqual(list(getPath(o, "mixed")), [1, 2]);
  assert.equal(getPath(o, "mixed.k"), "v");
});

test("empty blocks and empty input", () => {
  assert.deepEqual(parseClausewitz(`a={}`).a, {});
  assert.deepEqual(parseClausewitz(``), {});
  assert.deepEqual(list(parseClausewitz(`a={}`).a), []);
});

test("searchTree finds keys and values", () => {
  const o = parseClausewitz(`countries={ FRA={ treasury=10 } ENG={ treasury=20 name="Albion" } }`);
  assert.equal(searchTree(o, /treasury/).length, 2);
  assert.equal(searchTree(o, /albion/i, { values: true }).length, 1);
});
