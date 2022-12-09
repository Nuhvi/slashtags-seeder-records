/**
 * Most simple cache I can think of!
 * @param {number} size
 */
export default class Cache extends Map {
  constructor (size = 65536) {
    super()
    this._maxSize = size
  }

  /**
   * @param {string} key
   * @param {Uint8Array} value
   */
  set (key, value) {
    if (this.size >= this._maxSize) {
      this.delete(this.keys().next().value)
    }

    // this._queue.push(key)
    super.set(key, value)

    return this
  }

  /**
   * @param {string} key
   * @returns {Uint8Array}
   */
  get (key) {
    return super.get(key)
  }
}
