'use strict'

const BitmaskRegistry = require('./bitmask-registry')
const Condition = require('./condition')
const Predictor = require('./predictor')
const Writer = require('./writer')
const Reader = require('./reader')
const base64url = require('../util/base64url')
const PrefixError = require('../errors/prefix-error')
const ParseError = require('../errors/parse-error')

const FULFILLMENT_REGEX = /^cf:1:[1-9a-f][0-9a-f]{0,2}:[a-zA-Z0-9_-]+$/

class Fulfillment {
  /**
   * Create a Fulfillment object from a URI.
   *
   * This method will parse a fulfillment URI and construct a corresponding
   * Fulfillment object.
   *
   * @param {String} serializedFulfillment URI representing the fulfillment
   * @return {Fulfillment} Resulting object
   */
  static fromUri (serializedFulfillment) {
    if (typeof serializedFulfillment !== 'string') {
      throw new Error('Serialized fulfillment must be a string')
    }

    const pieces = serializedFulfillment.split(':')
    if (pieces[0] !== 'cf') {
      throw new PrefixError('Serialized fulfillment must start with "cf:"')
    }

    if (pieces[1] !== '1') {
      throw new PrefixError('Fulfillment must be version 1')
    }

    if (!FULFILLMENT_REGEX.exec(serializedFulfillment)) {
      throw new ParseError('Invalid fulfillment format')
    }

    const bitmask = parseInt(pieces[2], 16)
    const payload = Reader.from(base64url.decode(pieces[3]))

    const ConditionClass = BitmaskRegistry.getClassFromTypeBit(bitmask)
    const fulfillment = new ConditionClass()
    fulfillment.parsePayload(payload)

    return fulfillment
  }

  /**
   * Create a Fulfillment object from a binary blob.
   *
   * This method will parse a stream of binary data and construct a
   * corresponding Fulfillment object.
   *
   * @param {Reader} reader Binary stream implementing the Reader interface
   * @return {Fulfillment} Resulting object
   */
  static fromBinary (reader) {
    reader = Reader.from(reader)

    const ConditionClass = BitmaskRegistry.getClassFromTypeBit(reader.readVarUInt())

    const condition = new ConditionClass()
    condition.parsePayload(reader)

    return condition
  }

  /**
   * Return the type bit of this fulfillment.
   *
   * This is always just a single type bit, meaning the Hamming weight of the
   * number returned by this function will always be one.
   *
   * @return {Number} Integer with type bit set.
   */
  getTypeBit () {
    return this.constructor.TYPE_BIT
  }

  /**
   * Return the bitmask of this fulfillment.
   *
   * For simple fulfillment types this is simply the bit representing this type.
   *
   * For meta-fulfillments, these are the bits representing the types of the
   * subconditions.
   *
   * @return {Number} Bitmask corresponding to this fulfillment.
   */
  getBitmask () {
    return this.constructor.TYPE_BIT
  }

  /**
   * Generate condition corresponding to this fulfillment.
   *
   * An important property of crypto-conditions is that the condition can always
   * be derived from the fulfillment. This makes it very easy to post
   * fulfillments to a system without having to specify which condition the
   * relate to. The system can keep an index of conditions and look up any
   * matching events related to that condition.
   *
   * @return {Condition} Condition corresponding to this fulfillment.
   */
  getCondition () {
    const condition = new Condition()
    condition.setBitmask(this.getBitmask())
    condition.setHash(this.generateHash())
    condition.setMaxFulfillmentLength(this.calculateMaxFulfillmentLength())
    return condition
  }

  /**
   * Generate the hash of the fulfillment.
   *
   * This method is a stub and will be overridden by subclasses.
   */
  generateHash () {
    throw new Error('This method should be implemented by a subclass')
  }

  /**
   * Calculate the maximum length of the fulfillment payload.
   *
   * This implementation works by measuring the length of the fulfillment.
   * Condition types that do not have a constant length will override this
   * method with one that calculates the maximum possible length.
   *
   * @return {Number} Maximum fulfillment length
   */
  calculateMaxFulfillmentLength () {
    const predictor = new Predictor()
    this.writePayload(predictor)
    return predictor.getSize()
  }

  /**
   * Generate the URI form encoding of this fulfillment.
   *
   * Turns the fulfillment into a URI containing only URL-safe characters. This
   * format is convenient for passing around fulfillments in URLs, JSON and
   * other text-based formats.
   *
   * @return {String} Fulfillment as a URI
   */
  serializeUri () {
    return 'cf:1:' + this.getTypeBit().toString(16) + ':' +
      base64url.encode(this.serializePayload())
  }

  /**
   * Serialize fulfillment to a buffer.
   *
   * Encodes the fulfillment as a string of bytes. This is used internally for
   * encoding subfulfillments, but can also be used to passing around
   * fulfillments in a binary protocol for instance.
   *
   * @return {Buffer} Serialized fulfillment
   */
  serializeBinary () {
    const writer = new Writer()
    writer.writeVarUInt(this.getTypeBit())
    this.writePayload(writer)
    return writer.getBuffer()
  }

  /**
   * Return the fulfillment payload as a buffer.
   *
   * Note that the fulfillment payload is not the standard format for passing
   * fulfillments in binary protocols. Use `serializeBinary` for that. The
   * fulfillment payload is purely the type-specific data and does not include
   * the bitmask.
   *
   * @return {Buffer} Fulfillment payload
   */
  serializePayload () {
    const writer = new Writer()
    this.writePayload(writer)
    return writer.getBuffer()
  }

  /**
   * Validate this fulfillment.
   *
   * This implementation is a stub and will be overridden by the subclasses.
   *
   * @return {Boolean} Validation result
   */
  validate () {
    throw new Error('Not implemented')
  }
}

module.exports = Fulfillment
