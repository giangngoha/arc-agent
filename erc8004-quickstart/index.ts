import {
  createPublicClient,
  createWalletClient,
  http,
  keccak256,
  parseAbiItem,
  toHex,
  getContract,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arcTestnet } from "viem/chains";

const IDENTITY_REGISTRY   = "0x8004A818BFB912233c491871b3d84c89A494BD9e";
const REPUTATION_REGISTRY = "0x8004B663056A597Dffe9eCcC1965A193B7388713";
const VALIDATION_REGISTRY = "0x8004Cb1BF31DAf7788923b405b754f57acEB4272";
const METADATA_URI = process.env.METADATA_URI ?? "ipfs://bafkreibdi6623n3xpf7ymk62ckb4bo75o3qemwkpfvp5i25j66itxvsoei";

const ownerAccount     = privateKeyToAccount(process.env.OWNER_PRIVATE_KEY as `0x${string}`);
const validatorAccount = privateKeyToAccount(process.env.VALIDATOR_PRIVATE_KEY as `0x${string}`);

const publicClient = createPublicClient({ chain: arcTestnet, transport: http() });
const ownerWallet  = createWalletClient({ account: ownerAccount,     chain: arcTestnet, transport: http() });
const valWallet    = createWalletClient({ account: validatorAccount,  chain: arcTestnet, transport: http() });

const identityAbi = [
  { name:"register",  type:"function", stateMutability:"nonpayable", inputs:[{name:"metadataURI",type:"string"}], outputs:[] },
  { name:"ownerOf",   type:"function", stateMutability:"view",       inputs:[{name:"tokenId",type:"uint256"}],    outputs:[{name:"",type:"address"}] },
  { name:"tokenURI",  type:"function", stateMutability:"view",       inputs:[{name:"tokenId",type:"uint256"}],    outputs:[{name:"",type:"string"}] },
] as const;

const reputationAbi = [
  { name:"giveFeedback", type:"function", stateMutability:"nonpayable",
    inputs:[{name:"agentId",type:"uint256"},{name:"score",type:"int128"},{name:"feedbackType",type:"uint8"},{name:"tag",type:"string"},{name:"metadataURI",type:"string"},{name:"evidenceURI",type:"string"},{name:"comment",type:"string"},{name:"feedbackHash",type:"bytes32"}],
    outputs:[] },
] as const;

const validationAbi = [
  { name:"validationRequest",  type:"function", stateMutability:"nonpayable",
    inputs:[{name:"validator",type:"address"},{name:"agentId",type:"uint256"},{name:"requestURI",type:"string"},{name:"requestHash",type:"bytes32"}], outputs:[] },
  { name:"validationResponse", type:"function", stateMutability:"nonpayable",
    inputs:[{name:"requestHash",type:"bytes32"},{name:"response",type:"uint8"},{name:"responseURI",type:"string"},{name:"responseHash",type:"bytes32"},{name:"tag",type:"string"}], outputs:[] },
] as const;

async function wait(hash: `0x${string}`, label: string) {
  console.log(`  ⏳ ${label}…`);
  const r = await publicClient.waitForTransactionReceipt({ hash });
  console.log(`  ✓  Confirmed — block ${r.blockNumber}`);
  console.log(`     https://testnet.arcscan.app/tx/${hash}`);
  return r;
}

async function main() {
  console.log("\n╔══════════════════════════════════════╗");
  console.log("║  ERC-8004 Agent Registration — Arc   ║");
  console.log("╚══════════════════════════════════════╝\n");
  console.log(`Owner:     ${ownerAccount.address}`);
  console.log(`Validator: ${validatorAccount.address}\n`);

  // 1 — Register identity
  console.log("── Step 1: Register identity ──");
  const regTx = await ownerWallet.writeContract({ address: IDENTITY_REGISTRY, abi: identityAbi, functionName: "register", args: [METADATA_URI], account: ownerAccount });
  const regReceipt = await wait(regTx, "Registration");

  // 2 — Get agent ID from Transfer event
  const logs = await publicClient.getLogs({
    address: IDENTITY_REGISTRY,
    event: parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)"),
    args: { to: ownerAccount.address },
    fromBlock: regReceipt.blockNumber,
    toBlock:   regReceipt.blockNumber,
  });
  if (!logs.length) throw new Error("No Transfer event found");
  const agentId = logs[logs.length - 1].args.tokenId!;

  const identity = getContract({ address: IDENTITY_REGISTRY, abi: identityAbi, client: publicClient });
  const owner    = await identity.read.ownerOf([agentId]);
  const uri      = await identity.read.tokenURI([agentId]);
  console.log(`\n  Agent ID: ${agentId}  |  Owner: ${owner}`);
  console.log(`  URI:      ${uri}\n`);

  // 3 — Reputation
  console.log("── Step 2: Record reputation ──");
  const tag          = "successful_trade";
  const feedbackHash = keccak256(toHex(tag));
  const repTx = await valWallet.writeContract({ address: REPUTATION_REGISTRY, abi: reputationAbi, functionName: "giveFeedback", args: [agentId, 95n, 0, tag, "", "", "", feedbackHash], account: validatorAccount });
  await wait(repTx, "Reputation");

  // 4 — Validation request
  console.log("\n── Step 3: Request validation ──");
  const requestHash = keccak256(toHex(`kyc_${agentId}`));
  const reqTx = await ownerWallet.writeContract({ address: VALIDATION_REGISTRY, abi: validationAbi, functionName: "validationRequest", args: [validatorAccount.address, agentId, "ipfs://example-request", requestHash], account: ownerAccount });
  await wait(reqTx, "Validation request");

  // 5 — Validation response
  console.log("\n── Step 4: Validation response ──");
  const resTx = await valWallet.writeContract({ address: VALIDATION_REGISTRY, abi: validationAbi, functionName: "validationResponse", args: [requestHash, 100, "", `0x${"0".repeat(64)}` as `0x${string}`, "kyc_verified"], account: validatorAccount });
  await wait(resTx, "Validation response");

  console.log("\n╔══════════════════════════════════════╗");
  console.log("║  ✓ Identity registered               ║");
  console.log("║  ✓ Reputation recorded               ║");
  console.log("║  ✓ Validation verified               ║");
  console.log("╚══════════════════════════════════════╝");
  console.log(`\n  Explorer: https://testnet.arcscan.app/address/${ownerAccount.address}\n`);
}

main().catch(e => { console.error("\n✗", e.message ?? e); process.exit(1); });
