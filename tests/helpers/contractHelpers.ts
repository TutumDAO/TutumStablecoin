import { Signer } from 'redspot/types';
import Contract from '@redspot/patract/contract';
import { fromSigner } from '../../scripts/helpers';

export async function mintDummyAndApprove(token: Contract, user: Signer, amount: bigint | number, approve: Contract) {
  await fromSigner(token, user.address).tx.mintAnyCaller(user.address, amount);
  await fromSigner(token, user.address).tx.approve(approve.address, amount);
}
