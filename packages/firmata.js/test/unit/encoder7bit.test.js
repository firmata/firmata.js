require("../common/bootstrap");

describe("Encoder7Bit", () => {
  it("must encode and decode via in-memory array", done => {
    const input = [40, 219, 239, 33, 5, 0, 0, 93, 0, 0, 0, 0, 0, 0, 0, 0];
    const encoded = Encoder7Bit.to7BitArray(input);
    const decoded = Encoder7Bit.from7BitArray(encoded);

    assert.deepEqual(decoded, input);
    done();
  });
});
