import {
  bytesToHex,
  decodeFunctionResult,
  encodeFunctionData,
  namehash,
  parseAbi,
  type Address,
  type Hex,
} from "viem";

const UNIVERSAL_RESOLVER_ABI = parseAbi([
  "function resolve(bytes name, bytes data) view returns (bytes resolved, address resolver)",
]);

const ADDR_RESOLVER_ABI = parseAbi([
  "function addr(bytes32 node) view returns (address)",
]);

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

export const BENCHMARK_NAME = "vitalik.eth";
export const UNIVERSAL_RESOLVER_ADDRESS =
  "0xce01f8eee7E479C928F8919abD53E553a36CeF67" as const;

export const BENCHMARK_CALLDATA = encodeFunctionData({
  abi: UNIVERSAL_RESOLVER_ABI,
  functionName: "resolve",
  args: [
    dnsEncode(BENCHMARK_NAME),
    encodeFunctionData({
      abi: ADDR_RESOLVER_ABI,
      functionName: "addr",
      args: [namehash(BENCHMARK_NAME)],
    }),
  ],
});

export function decodeResolvedAddress(result: Hex): Address {
  const [resolved] = decodeFunctionResult({
    abi: UNIVERSAL_RESOLVER_ABI,
    functionName: "resolve",
    data: result,
  });

  const address = decodeFunctionResult({
    abi: ADDR_RESOLVER_ABI,
    functionName: "addr",
    data: resolved,
  });

  if (address.toLowerCase() === ZERO_ADDRESS) {
    throw new Error("ENS lookup resolved to the zero address");
  }

  return address;
}

function dnsEncode(name: string): Hex {
  const encoder = new TextEncoder();
  const bytes: number[] = [];

  for (const label of name.split(".")) {
    const encoded = encoder.encode(label);

    if (encoded.length === 0 || encoded.length > 63) {
      throw new Error(`Invalid ENS label "${label}"`);
    }

    bytes.push(encoded.length, ...encoded);
  }

  bytes.push(0);

  return bytesToHex(Uint8Array.from(bytes));
}
