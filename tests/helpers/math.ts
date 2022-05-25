const random = require('random-bigint');

export function randomBigInt(modulo: bigint): bigint {
  return BigInt(random(128)) % modulo;
}

export function randomNumber(modulo: number): number {
  return Math.floor(Math.random() * modulo);
}
