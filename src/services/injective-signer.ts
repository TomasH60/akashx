import {
  Bip39,
  EnglishMnemonic,
  Secp256k1,
  Slip10,
  Slip10Curve,
  stringToPath,
} from '@cosmjs/crypto';
import { toBase64, toBech32 } from '@cosmjs/encoding';
import { makeSignBytes, type OfflineDirectSigner } from '@cosmjs/proto-signing';
import { keccak256 } from 'viem';

/** Injective uses Ethereum address derivation and Keccak hashing for SIGN_MODE_DIRECT. */
export async function createInjectiveSigner(mnemonic: string): Promise<OfflineDirectSigner> {
  const seed = await Bip39.mnemonicToSeed(new EnglishMnemonic(mnemonic));
  const { privkey } = Slip10.derivePath(
    Slip10Curve.Secp256k1,
    seed,
    stringToPath("m/44'/60'/0'/0/0"),
  );
  const { pubkey } = Secp256k1.makeKeypair(privkey);
  const compressed = Secp256k1.compressPubkey(pubkey);
  const address = toBech32('inj', keccak256(pubkey.slice(1), 'bytes').slice(-20));

  return {
    async getAccounts() {
      return [{ address, algo: 'ethsecp256k1', pubkey: compressed.slice() }];
    },
    async signDirect(signerAddress, signDoc) {
      if (signerAddress !== address) throw new Error('Unknown Injective signer address.');
      if (!signDoc.chainId.startsWith('injective-')) {
        throw new Error('The Injective signer can only sign Injective transactions.');
      }
      const hash = keccak256(makeSignBytes(signDoc), 'bytes');
      const signature = Secp256k1.createSignature(hash, privkey);
      return {
        signed: signDoc,
        signature: {
          pub_key: { type: 'ethermint/PubKeyEthSecp256k1', value: toBase64(compressed) },
          signature: toBase64(new Uint8Array([...signature.r(32), ...signature.s(32)])),
        },
      };
    },
  };
}
