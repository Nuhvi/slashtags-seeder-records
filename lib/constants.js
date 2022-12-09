import crypto from 'hypercore-crypto'

export const COMMANDS = {
  PUT: 100,
  GET: 101
}

export const [NS] = crypto.namespace('@slashtags/seeders-record', 1)

/**
 * @typedef {{
 *  seq: number,
 *  value: string[]
 *  signature: Uint8Array
 * }} Record
 */
