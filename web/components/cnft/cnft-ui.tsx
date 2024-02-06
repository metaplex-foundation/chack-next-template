import { MetadataArgsArgs, createTree, fetchMerkleTree, fetchTreeConfigFromSeeds, transfer, mintV1, mplBubblegum, parseLeafFromMintV1Transaction, getAssetWithProof } from "@metaplex-foundation/mpl-bubblegum";
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { useMemo, useState } from "react";
import { dasApi } from '@metaplex-foundation/digital-asset-standard-api';
import { walletAdapterIdentity } from '@metaplex-foundation/umi-signer-wallet-adapters';
import { generateSigner, none, publicKey } from '@metaplex-foundation/umi';
import { mplTokenMetadata } from "@metaplex-foundation/mpl-token-metadata";
import toast from 'react-hot-toast';
import { base58 } from "@metaplex-foundation/umi-serializers-encodings";

// dirty way to json serialize bigint
(BigInt.prototype as any).toJSON = function () {
  return this.toString();
};

export function CnftUi() {
  const { connection } = useConnection()
  const wallet = useWallet();
  const [treeId, setTreeId] = useState<string>()
  const [treeConfig, setTreeConfig] = useState<string>()
  const [treeInfo, setTreeInfo] = useState<string>()
  const [cnftId, setCnftId] = useState<string>()
  const [cnftInfo, setCnftInfo] = useState<string>()
  const [counter, setCounter] = useState<number>(0)
  const [loading, setLoading] = useState<boolean>(false)
  const [recipient, setRecipient] = useState<string>()

  const umi = useMemo(() => {
    return createUmi(connection)
      .use(walletAdapterIdentity(wallet))
      .use(mplTokenMetadata())
      .use(dasApi())
      .use(mplBubblegum())
  }, [connection, wallet])

  return (
    <div className="flex gap-y-4 flex-col pb-12 min-w-full">
      {loading && <span className="loading loading-dots loading-lg"></span>}
      <button
        className="btn"
        disabled={loading}
        onClick={async () => {
          try {
            setLoading(true)
            const merkleTree = generateSigner(umi);

            // When we create a tree at this address.
            const builder = await createTree(umi, {
              merkleTree,
              maxDepth: 14,
              maxBufferSize: 64,
              public: false,
            });
            const tx = await builder.sendAndConfirm(umi);
            const sig = base58.deserialize(tx.signature)[0]
            setTreeId(merkleTree.publicKey)
            console.log('created tree', sig)
            toast.success(`Tree created, ${sig}`)
          } catch (error: any) {
            console.error(error);
            toast.error(error.message)
          } finally {
            setLoading(false)
          }
        }}>Create tree</button>




      <label className="form-control w-full">
        <div className="label">
          <span className="label-text">Tree id</span>
        </div>
        <input id="tree-id" name="treeId" type="text" placeholder="Tree id" className="input input-bordered w-full"
          onChange={e => setTreeId(e.target.value)}
          value={treeId}
        />
      </label>
      <button
        type="button"
        className="btn mt-2"
        disabled={loading}
        onClick={async () => {
          if (!treeId) return;
          try {
            setLoading(true)
            const treeConfig = await fetchTreeConfigFromSeeds(umi, {
              merkleTree: publicKey(treeId),
            });
            setTreeConfig(JSON.stringify(treeConfig, null, 2))

            const treeInfo = await fetchMerkleTree(umi, publicKey(treeId));
            setTreeInfo(JSON.stringify(treeInfo, null, 2))
          } catch (error: any) {
            console.error(error);
            toast.error(error.message)
          } finally {
            setLoading(false)
          }
        }}
      >Fetch tree config</button>


      {treeConfig && <label className="form-control w-full">
        <div className="label">
          <span className="label-text">Tree config </span>
        </div>
        <textarea className="textarea textarea-bordered" placeholder="None" value={treeConfig} readOnly rows={30}/>
      </label>}

      {treeInfo && <label className="form-control w-full">
        <div className="label">
          <span className="label-text">Tree info</span>
        </div>
        <textarea className="textarea textarea-bordered" placeholder="None" value={treeInfo} readOnly rows={30}/>
      </label>}

      <div className="divider" />

      <button
        className="btn"
        disabled={loading}
        onClick={async () => {
          if (!treeId) return;
          try {
            setLoading(true)
            const owner = umi.identity.publicKey
            const metadata: MetadataArgsArgs = {
              name: `My NFT ${counter}`,
              uri: 'https://example.com/my-nft.json',
              sellerFeeBasisPoints: 500, // 5%
              collection: none(),
              creators: [],
            };

            const tx = await mintV1(umi, {
              leafOwner: owner,
              merkleTree: publicKey(treeId),
              metadata
            }).sendAndConfirm(umi);
            const sig = base58.deserialize(tx.signature)[0]

            const leaf = await parseLeafFromMintV1Transaction(umi, tx.signature)

            setCnftId(leaf.id)

            console.log('asset', leaf)
            console.log('minted', sig)

            setCounter((counter) => counter + 1)
            toast.success(`cNFT minted, ${sig}`)
          } catch (error: any) {
            console.error(error);
            toast.error(error.message)
          } finally {
            setLoading(false)
          }
        }}>Mint cNFT</button>


      <label className="form-control w-full">
        <div className="label">
          <span className="label-text">cNFT id</span>
        </div>
        <input id="cnft-id" name="cnftId" type="text" placeholder="cNFT id" className="input input-bordered w-full"
          onChange={e => setCnftId(e.target.value)}
          value={cnftId}
        />
      </label>
      <button
        type="button"
        className="btn mt-2"
        disabled={loading}
        onClick={async () => {
          if (!cnftId) return;
          try {
            setLoading(true)
            const cnft = await umi.rpc.getAsset(publicKey(cnftId));
            setCnftInfo(JSON.stringify(cnft, null, 2))
          } catch (error: any) {
            console.error(error);
            toast.error(error.message)
          } finally {
            setLoading(false)
          }
        }}
      >Fetch cNFT</button>

      {cnftInfo && <label className="form-control w-full">
        <div className="label">
          <span className="label-text">cNFT info</span>
        </div>
        <textarea className="textarea textarea-bordered" placeholder="None" value={cnftInfo} readOnly rows={50}></textarea>
      </label>}

      <label className="form-control w-full">
        <div className="label">
          <span className="label-text">cNFT recipient</span>
        </div>
        <input id="recipient" name="recipient" type="text" placeholder="Recipient wallet" className="input input-bordered w-full"
          onChange={e => setRecipient(e.target.value)}
          value={recipient}
        />
      </label>
      <button
        type="button"
        className="btn mt-2"
        disabled={loading}
        onClick={async () => {
          if (!cnftId || !recipient) return;
          try {
            setLoading(true)

            const assetWithProof = await getAssetWithProof(umi, publicKey(cnftId));

            const tx = await transfer(umi, {
              ...assetWithProof,
              leafOwner: publicKey(umi.identity.publicKey),
              newLeafOwner: publicKey(recipient),
            }).sendAndConfirm(umi);

            const sig = base58.deserialize(tx.signature)[0]

            console.log('transfer', sig)
            toast.success(`cNFT transferred, ${sig}`)

          } catch (error: any) {
            console.error(error);
            toast.error(error.message)
          } finally {
            setLoading(false)
          }
        }}
      >Transfer cNFT</button>
    </div>
  )
}
