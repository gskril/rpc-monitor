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

  const quicknodeUrl =
    normalizeUrl(readEnv(env, "QUICKNODE_URL")) ??
    normalizeUrl(readEnv(env, "QUICKNODE_ENDPOINT"));
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

  const chainstackUrl =
    normalizeUrl(readEnv(env, "CHAINSTACK_URL")) ??
    normalizeUrl(readEnv(env, "CHAINSTACK_ENDPOINT"));
  const chainstackKey = readEnv(env, "CHAINSTACK_API_KEY");
  if (chainstackUrl) {
    providers.push({ name: "chainstack", url: chainstackUrl });
  } else if (chainstackKey) {
    providers.push({
      name: "chainstack",
      url: chainstack(MAINNET, chainstackKey),
    });
  }

  providers.push({ name: "ankr", url: ankr(MAINNET) });
  providers.push({ name: "publicnode", url: publicNode(MAINNET) });

  const drpcUrl = normalizeUrl(readEnv(env, "DRPC_URL"));
  const drpcKey = readEnv(env, "DRPC_API_KEY");
  providers.push({
    name: "drpc",
    url: drpcUrl ?? drpc(MAINNET, drpcKey),
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

function normalizeUrl(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  return value.startsWith("http://") || value.startsWith("https://")
    ? value
    : `https://${value}`;
}

function readEnv(env: NodeJS.ProcessEnv, key: string): string | undefined {
  const value = env[key]?.trim();
  return value ? value : undefined;
}
