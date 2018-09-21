#!/usr/bin/env node

const firmata = require("./lib/firmata");
const repl = require("repl");
console.log("Enter USB Port and press enter:");
process.stdin.resume();
process.stdin.setEncoding("utf8");
process.stdin.once("data", (chunk) => {
  const port = chunk.replace("\n", "");
  const board = new firmata.Board(port, () => {
    console.log(`Successfully Connected to ${port}`);
    repl.start("firmata>").context.board = board;
  });
});
