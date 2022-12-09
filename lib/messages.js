import c from 'compact-encoding'

export const valueEncoding = c.array(c.string)

export const putRequest = {
  preencode (state, m) {
    c.fixed32.preencode(state, m.publicKey)
    c.uint.preencode(state, m.seq)
    valueEncoding.preencode(state, m.value)
    c.fixed64.preencode(state, m.signature)
  },
  encode (state, m) {
    c.fixed32.encode(state, m.publicKey)
    c.uint.encode(state, m.seq)
    valueEncoding.encode(state, m.value)
    c.fixed64.encode(state, m.signature)
  },
  decode (state) {
    return {
      publicKey: c.fixed32.decode(state),
      seq: c.uint.decode(state),
      value: valueEncoding.decode(state),
      signature: c.fixed64.decode(state)
    }
  }
}

export const putSignable = {
  preencode (state, m) {
    c.uint.preencode(state, m.seq)
    valueEncoding.preencode(state, m.value)
  },
  encode (state, m) {
    c.uint.encode(state, m.seq)
    valueEncoding.encode(state, m.value)
  },
  decode (state) {
    return {
      seq: c.uint.decode(state),
      value: valueEncoding.decode(state)
    }
  }
}

export const getResponse = {
  preencode (state, m) {
    c.uint.preencode(state, m.seq)
    valueEncoding.preencode(state, m.value)
    c.fixed64.preencode(state, m.signature)
  },
  encode (state, m) {
    c.uint.encode(state, m.seq)
    valueEncoding.encode(state, m.value)
    c.fixed64.encode(state, m.signature)
  },
  decode (state) {
    return {
      seq: c.uint.decode(state),
      value: valueEncoding.decode(state),
      signature: c.fixed64.decode(state)
    }
  }
}
