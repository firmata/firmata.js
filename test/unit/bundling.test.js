// Built-in Dependencies
global.fs = require("fs");
global.path = require("path");

// Third-Party Dependencies
const sinon = require("sinon");
const browserify = require("browserify");
const webpack = require("webpack");

const entry = path.join(__dirname, "/fixtures/entry.js");
const output = path.join(__dirname, "/fixtures/output.js");
const source = fs.readFileSync(path.join(__dirname, "/../../packages/firmata.js/lib/firmata.js"), "utf8");
const lines = source.split("\n").map(line => line.trim());
const startAt = lines.indexOf("* constants");

describe("Bundling", /* this sensitive */ function() {
  const context = this;

  beforeEach(() => {
    fs.writeFileSync(output, "");
  });

  afterEach(() => {
    fs.unlinkSync(output);
  });

  it("must browserify", done => {
    context.timeout(1e5);
    const b = browserify(entry);

    b.bundle((error, buffer) => {
      const bundle = buffer.toString();
      assert.equal(error, null);
      lines.slice(startAt).forEach(line => {
        assert.equal(bundle.includes(line), true);
      });
      done();
    });
  });

  it("must webpack", done => {
    context.timeout(1e5);
    const w = webpack({
      entry,
      output: {
        filename: output
      }
    });

    w.run((error, stats) => {
      assert.equal(error, null);

      const bundle = fs.readFileSync(output, "utf8");
      lines.slice(startAt).forEach(line => {
        assert.equal(bundle.includes(line), true);
      });
      done();
    });
  });
});
