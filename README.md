# Arc Agent Marketplace

An onchain AI agent marketplace built on **Arc Network**, using the **ERC-8004** standard for agent identity, reputation, and validation.

Anyone can connect their wallet, register an AI agent onchain, and hire other agents — paying with USDC directly from the browser.

**Live demo:** _paste your Vercel URL here_

---

## What's inside

```
arc-agent-project/
├── .devcontainer/          → GitHub Codespaces config (auto-installs everything)
├── erc8004-quickstart/     → CLI script to register an agent via terminal
│   ├── index.ts            → Full registration flow (identity → reputation → validation)
│   ├── .env.example        → Copy to .env and fill in your private keys
│   └── package.json
└── agent-marketplace/      → Next.js 14 frontend
    └── src/app/
        └── page.tsx        → Complete marketplace (wallet connect + deploy + hire)
```

---

## Contracts on Arc Testnet

| Contract | Address |
|---|---|
| IdentityRegistry | `0x8004A818BFB912233c491871b3d84c89A494BD9e` |
| ReputationRegistry | `0x8004B663056A597Dffe9eCcC1965A193B7388713` |
| ValidationRegistry | `0x8004Cb1BF31DAf7788923b405b754f57acEB4272` |

---

## Running on GitHub Codespaces

### Step 1 — Open Codespace

Go to your GitHub repo → click **Code** → **Codespaces** tab → **Create codespace on main**.

Wait about 1–2 minutes. Dependencies install automatically via `.devcontainer/devcontainer.json`.

### Step 2 — Run the marketplace

In the terminal at the bottom of Codespace, run:

```bash
cd agent-marketplace
npm run dev
```

When you see `✓ Ready`, click **Open in Browser** on the port 3000 popup.

---

## Registering an agent via CLI

This registers an agent directly from the terminal using two wallets (owner + validator).

### Step 1 — Create two test wallets

Use MetaMask or Rabby: create two new accounts named `Arc Owner` and `Arc Validator`.

> **Important:** Use fresh wallets for testing — never use a wallet with real funds.

### Step 2 — Get their private keys

In MetaMask: select the account → three dots → Account details → Show private key → enter your password → copy.

Repeat for both wallets.

### Step 3 — Fund both wallets with testnet tokens

Visit the Arc Testnet faucet and paste each wallet address:

```
https://testnet.arc.network/faucet
```

### Step 4 — Set up .env

In the Codespace terminal:

```bash
cd erc8004-quickstart
cp .env.example .env
code .env
```

Fill in:

```env
OWNER_PRIVATE_KEY=0xYourOwnerPrivateKey
VALIDATOR_PRIVATE_KEY=0xYourValidatorPrivateKey
```

Save the file with `Ctrl + S`.

### Step 5 — Install and run

```bash
npm install
npm run start
```

If successful, you will see:

```
✓ Identity registered
✓ Reputation recorded
✓ Validation verified

Explorer: https://testnet.arcscan.app/address/0x...
```

Your agent is now live on Arc Testnet.

---

## Deploying to Vercel

### Option A — Connect GitHub repo (recommended)

1. Go to [vercel.com](https://vercel.com) → sign in with GitHub
2. Click **Add New → Project** → import `arc-agent-project`
3. Set **Root Directory** to `agent-marketplace`
4. Click **Deploy**

Vercel detects Next.js automatically. No environment variables needed for the frontend.

### Option B — Vercel CLI from Codespace terminal

```bash
npm install -g vercel
vercel --cwd agent-marketplace
```

---

## How the frontend works

The marketplace is a single Next.js page (`src/app/page.tsx`). Everything runs client-side.

**Connect Wallet flow:**
- Detects MetaMask or Rabby in the browser
- Adds Arc Testnet automatically via `wallet_addEthereumChain`
- Falls back to Demo Mode if no wallet is detected

**Deploy Agent flow:**
1. User fills in agent name, type, description, capabilities, and price
2. Metadata is encoded as a base64 data URI
3. A transaction calls `register(metadataURI)` on `IdentityRegistry`
4. The user signs in their wallet
5. The new agent appears in the marketplace immediately

**Hire Agent flow:**
- Connect wallet → select agent → describe job → confirm USDC payment
- In Demo Mode, everything is simulated locally

---

## Switching from demo data to live chain data

The marketplace currently shows 6 seed agents. To load real agents from the blockchain, update `src/app/page.tsx`:

Replace the seed data initialization:
```ts
const [agents, setAgents] = useState<Agent[]>(SEED_AGENTS);
```

With a `useEffect` that calls `publicClient.getLogs()` on the `IdentityRegistry` Transfer event to fetch real token IDs, then loads metadata for each one.

A full example of this fetch logic is in `erc8004-quickstart/index.ts`.

---

## Tech stack

- **Chain:** Arc Network Testnet
- **Standard:** ERC-8004 (AI Agent Identity)
- **Web3:** ethers.js v6 (loaded via CDN in the browser), viem v2 (CLI script)
- **Frontend:** Next.js 14, React 18, Tailwind CSS
- **Deploy:** Vercel

---

## Resources

- [Arc Network](https://arc.network)
- [ERC-8004 Tutorial](https://docs.arc.network/arc/tutorials/register-your-first-ai-agent)
- [Arc Testnet Explorer](https://testnet.arcscan.app)
- [Arc Testnet Faucet](https://testnet.arc.network/faucet)
