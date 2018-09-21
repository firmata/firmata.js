require("../common/bootstrap");

const entry = path.join(__dirname, "/fixtures/entry.js");
const output = path.join(__dirname, "/fixtures/output.js");
const source = fs.readFileSync(path.join(__dirname, "/../../packages/firmata.js/lib/firmata.js"), "utf8");
const lines = source.split("\n").map(line => line.trim());
const startAt = lines.indexOf("* constants");

describe("Bundling", function() {
  const context = this;

  beforeEach(() => {
    fs.writeFileSync(output, "");
  });

  afterEach(() => {
    fs.unlinkSync(output);
  });

  it("must browserify", function(done) {
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

  it("must webpack", function(done) {
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
