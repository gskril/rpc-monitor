import {
  alchemy,
  ankr,
  chainstack,
  drpc,
  infura,
  publicNode,
  quicknode,
} from "evm-providers";

export type ProviderConfig = {
  name: string;
  url: string;
};

const MAINNET = 1 as never;

export function loadProviders(env: NodeJS.ProcessEnv): ProviderConfig[] {
  const providers: ProviderConfig[] = [];

  const alchemyKey = readEnv(env, "ALCHEMY_API_KEY");
  if (alchemyKey) {
    providers.push({ name: "alchemy", url: alchemy(MAINNET, alchemyKey) });
  }

  const quicknodeUrl = readEnv(env, "QUICKNODE_URL");
  const quicknodeAppName = readEnv(env, "QUICKNODE_APP_NAME");
  const quicknodeApiKey = readEnv(env, "QUICKNODE_API_KEY");
  if (quicknodeUrl) {
    providers.push({ name: "quicknode", url: quicknodeUrl });
  } else if (quicknodeAppName && quicknodeApiKey) {
    providers.push({
      name: "quicknode",
      url: quicknode(MAINNET, quicknodeAppName, quicknodeApiKey),
    });
  }

  const infuraKey = readEnv(env, "INFURA_API_KEY");
  if (infuraKey) {
    providers.push({ name: "infura", url: infura(MAINNET, infuraKey) });
  }

  const chainstackKey = readEnv(env, "CHAINSTACK_API_KEY");
  if (chainstackKey) {
    providers.push({
      name: "chainstack",
      url: chainstack(MAINNET, chainstackKey),
    });
  }

  const ankrKey = readEnv(env, "ANKR_API_KEY");
  if (ankrKey) {
    providers.push({
      name: "ankr",
      url: ankr(MAINNET, ankrKey),
    });
  }

  const goldskyKey = readEnv(env, "GOLDSKY_API_KEY");
  if (goldskyKey) {
    providers.push({
      name: "goldsky",
      url: `https://edge.goldsky.com/standard/evm/1?secret=${goldskyKey}`,
    });
  }

  providers.push({ name: "publicnode", url: publicNode(MAINNET) });

  const drpcKey = readEnv(env, "DRPC_API_KEY");
  providers.push({
    name: "drpc",
    url: drpc(MAINNET, drpcKey),
  });

  return dedupeByName(providers);
}

function dedupeByName(providers: ProviderConfig[]): ProviderConfig[] {
  const unique = new Map<string, ProviderConfig>();

  for (const provider of providers) {
    unique.set(provider.name, provider);
  }

  return Array.from(unique.values());
}

function readEnv(env: NodeJS.ProcessEnv, key: string): string | undefined {
  const value = env[key]?.trim();
  return value ? value : undefined;
}
