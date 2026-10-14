import { Secp256k1, Secp256k1Signature, sha256 } from '@cosmjs/crypto';
import { fromBase64, fromBech32, toHex } from '@cosmjs/encoding';
import { makeSignBytes, makeSignDoc } from '@cosmjs/proto-signing';
import { keccak256 } from 'viem';
import { describe, expect, it } from 'vitest';
import { createInjectiveSigner } from '../../src/services/injective-signer.js';

// Public Hardhat fixture; never use this mnemonic for real funds.
const mnemonic = 'test test test test test test test test test test test junk';

describe('Injective signer', () => {
  it('derives the Ethereum BIP-44 account and encodes its address as inj', async () => {
    const signer = await createInjectiveSigner(mnemonic);
    const [account] = await signer.getAccounts();
    expect(account!.algo).toBe('ethsecp256k1');
    expect(account!.pubkey).toHaveLength(33);
    expect(fromBech32(account!.address, 90).prefix).toBe('inj');
    expect(toHex(fromBech32(account!.address, 90).data)).toBe(
      'f39fd6e51aad88f6f4ce6ab8827279cfffb92266',
    );
    const publicKey = Secp256k1.uncompressPubkey(account!.pubkey);
    expect(fromBech32(account!.address, 90).data).toEqual(
      keccak256(publicKey.slice(1), 'bytes').slice(-20),
    );
  });

  it('signs protobuf sign bytes with Keccak and a compact 64-byte signature', async () => {
    const signer = await createInjectiveSigner(mnemonic);
    const [account] = await signer.getAccounts();
    const doc = makeSignDoc(new Uint8Array([1, 2]), new Uint8Array([3, 4]), 'injective-888', 7);
    const result = await signer.signDirect(account!.address, doc);
    const bytes = makeSignBytes(doc);
    const signatureBytes = fromBase64(result.signature.signature);
    expect(signatureBytes).toHaveLength(64);
    expect(result.signed).toEqual(doc);
    expect(fromBase64(result.signature.pub_key.value)).toEqual(account!.pubkey);
    const signature = Secp256k1Signature.fromFixedLength(signatureBytes);
    expect(Secp256k1.verifySignature(signature, keccak256(bytes, 'bytes'), account!.pubkey)).toBe(
      true,
    );
    expect(Secp256k1.verifySignature(signature, sha256(bytes), account!.pubkey)).toBe(false);
    await expect(signer.signDirect('inj1wrong', doc)).rejects.toThrow('Unknown Injective');
    await expect(
      signer.signDirect(account!.address, { ...doc, chainId: 'akashnet-2' }),
    ).rejects.toThrow('only sign Injective');
  });
});
